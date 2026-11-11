import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { MaasiiError } from "./errors";

export const MAX_BRAND_ARTWORK_BYTES = 4 * 1024 * 1024;
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;
export const brandArtworkMimeTypes = Object.keys(formats);

/** Verify the supplied type against the decoded raster, then strip metadata and compress it. */
export async function prepareBrandArtwork(file: File, width: number, height: number) {
  try {
    const format = formats[file.type as keyof typeof formats];
    if (!format || file.size === 0 || file.size > MAX_BRAND_ARTWORK_BYTES) throw new Error("Unsupported file.");
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) > 1) throw new Error("Unsupported raster.");
    return await image.autoOrient().resize({ width, height, fit: "inside", withoutEnlargement: true }).webp().toBuffer();
  } catch {
    throw new MaasiiError("invalid_input", "Use a JPEG, PNG or WebP image up to 4 MB.", "invalidBrandArtwork");
  }
}

export function brandArtworkBucket() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase Storage credentials are missing.");
  // Uploads go through the core so every public object passes raster validation.
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from("brand-artwork");
}

export async function uploadBrandArtwork(bucket: ReturnType<typeof brandArtworkBucket>, path: string, bytes: Buffer) {
  const { error } = await bucket.upload(path, bytes, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}
