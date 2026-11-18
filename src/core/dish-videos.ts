import { createClient } from "@supabase/supabase-js";
import { createFile, type Movie, type MP4BoxBuffer } from "mp4box";
import { z } from "zod";
import type { Actor } from "./actor";
import { requireBrandOwner, requireVenueManager } from "./access";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

export const MAX_DISH_VIDEO_BYTES = 1024 * 1024;
const invalid = () => new MaasiiError("invalid_input", "Use a silent H.264 MP4, 2–5 seconds, up to 720px and 1 MiB.", "invalidDishVideo");

async function validateVideo(video: File) {
  if (video.type !== "video/mp4" || !video.size || video.size > MAX_DISH_VIDEO_BYTES) throw invalid();
  const bytes = await video.arrayBuffer() as MP4BoxBuffer;
  bytes.fileStart = 0;
  const parser = createFile();
  let info: Movie | undefined;
  let failed = false;
  parser.onReady = value => { info = value; };
  parser.onError = () => { failed = true; };
  try { parser.appendBuffer(bytes); parser.flush(); } catch { throw invalid(); }
  if (failed || !info || info.isFragmented || info.tracks.length !== 1) throw invalid();
  const track = info.tracks[0];
  const seconds = track.duration / track.timescale;
  const durationMs = Math.round(seconds * 1000);
  if (!track.video || !/^avc1\./.test(track.codec) || !track.nb_samples || !Number.isFinite(durationMs)
    || seconds < 2 || seconds > 5 || !Number.isInteger(track.video.width) || !Number.isInteger(track.video.height)
    || track.video.width < 1 || track.video.height < 1
    || Math.max(track.video.width, track.video.height) > 720) throw invalid();
  // Encrypted sample entries report encv rather than avc1; require a complete progressive file.
  const entries = parser.moov?.traks[0]?.mdia?.minf?.stbl?.stsd?.entries;
  if (!entries?.length || entries.some(entry => entry.type !== "avc1")) throw invalid();
  const samples = parser.getTrackById(track.id).samples;
  if (samples.length !== track.nb_samples || samples.some(sample => !Number.isSafeInteger(sample.offset)
    || sample.offset < 0 || sample.size < 1 || sample.offset + sample.size > bytes.byteLength)) throw invalid();
  return { bytes, durationMs, width: track.video.width, height: track.video.height };
}

export async function uploadDishVideo(actor: Actor, input: { brandId: string; video: File }, { now = new Date() } = {}) {
  const parsed = parseInput(z.object({ brandId: z.uuid(), video: z.file() }), input);
  await inTransaction(actor, tx => requireBrandOwner(tx, actor, parsed.brandId));
  return upload(actor, parsed.brandId, null, parsed.video, now);
}

export async function uploadVenueDishVideo(actor: Actor, input: { venueId: string; video: File }, { now = new Date() } = {}) {
  const { venueId, video } = parseInput(z.object({ venueId: z.uuid(), video: z.file() }), input);
  const brandId = await inTransaction(actor, async tx => {
    await requireVenueManager(tx, actor, venueId);
    const { rows } = await tx.query<{ brand_id: string }>("select brand_id from app.venues where id = $1", [venueId]);
    return rows[0].brand_id;
  });
  return upload(actor, brandId, venueId, video, now);
}

async function upload(actor: Actor, brandId: string, venueId: string | null, video: File, now: Date) {
  const { bytes, durationMs, width, height } = await validateVideo(video);
  const id = crypto.randomUUID();
  const path = `${id}.mp4`;
  const bucket = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from("dish-videos");
  const { error } = await bucket.upload(path, bytes, { contentType: "video/mp4", cacheControl: "31536000" });
  if (error) throw error;
  try {
    await inTransaction(actor, async tx => {
      if (venueId) await requireVenueManager(tx, actor, venueId); else await requireBrandOwner(tx, actor, brandId);
      await tx.query(`insert into app.dish_video_assets(id, brand_id, venue_id, storage_path, content_type, byte_size, duration_ms, width, height, created_at)
        values ($1,$2,$3,$4,'video/mp4',$5,$6,$7,$8,$9)`, [id, brandId, venueId, path, bytes.byteLength, durationMs, width, height, now]);
    });
  } catch (error) { await bucket.remove([path]); throw error; }
  return { id, durationMs, width, height };
}

export async function validateDishVideos(tx: Tx, brandId: string, venueId: string | null, dishes: { videoAssetId?: string }[]) {
  const ids = [...new Set(dishes.flatMap(d => d.videoAssetId ? [d.videoAssetId] : []))];
  if (!ids.length) return;
  const { rowCount } = await tx.query(`select id from app.dish_video_assets where id = any($1::uuid[]) and brand_id = $2 and (venue_id is null or venue_id = $3)`, [ids, brandId, venueId]);
  if (rowCount !== ids.length) throw invalid();
}
