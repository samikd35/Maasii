// Maintenance only: dry-run by default. --delete removes unreferenced uploads older than seven days.
import { existsSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY).storage;
const remove = process.argv.includes("--delete");
await db.connect();
try {
  await db.query("begin");
  // Prevent saving/publishing a reference between the scan and deletion.
  await db.query("lock app.brand_menu_drafts, app.venue_menu_drafts, app.venue_menu_revisions, app.menu_version_dishes, app.brands, app.dish_video_assets in share row exclusive mode");
  const references = await db.query(`select row_to_json(r)::text as value from app.brand_menu_drafts r
    union all select row_to_json(r)::text from app.venue_menu_drafts r
    union all select row_to_json(r)::text from app.venue_menu_revisions r
    union all select row_to_json(r)::text from app.menu_version_dishes r
    union all select row_to_json(r)::text from app.brands r`);
  const content = references.rows.map(row => row.value).join("\n");
  const { rows } = await db.query(`select bucket_id, name from storage.objects
    where created_at < now() - interval '7 days'
    and (bucket_id = 'dish-videos' or (bucket_id = 'brand-artwork' and name like '%dish-%'))`);
  for (const object of rows) {
    const key = object.bucket_id === "dish-videos" ? object.name.replace(/\.mp4$/, "") : object.name.replace(/-thumb\.webp$/, "-detail.webp");
    if (content.includes(object.name) || content.includes(key)) continue;
    console.log(`${remove ? "Delete" : "Would delete"} ${object.bucket_id}/${object.name}`);
    if (!remove) continue;
    const { error } = await storage.from(object.bucket_id).remove([object.name]);
    if (error) throw error;
    if (object.bucket_id === "dish-videos") await db.query("delete from app.dish_video_assets where storage_path = $1", [object.name]);
  }
  await db.query("commit");
} catch (error) { await db.query("rollback"); throw error; }
finally { await db.end(); }
