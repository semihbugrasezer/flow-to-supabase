# Flow Image Auto Uploader

Automatically uploads new images from Flow to Supabase Storage. A browser userscript detects new images while Flow is open, and a Vercel API performs compression, metadata generation, and deduplication.

## Architecture

- **Userscript**: Runs in the browser and collects new image URLs from the Flow page.
- **Vercel API**: Downloads images, compresses them, writes metadata, and uploads to Supabase.
- **Supabase Storage**: Stores the JPEG and a JSON metadata file per image.

## About Flow

Flow is a Google Labs product for generating media. More details: https://labs.google/flow/about.

## Requirements

- Supabase project with a storage bucket (example: `flow-image`)
- Vercel project hosting this repo
- Tampermonkey or Violentmonkey installed in the browser

## Vercel Environment Variables

Set these in Vercel (Production and Preview):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
BUCKET_NAME=flow-image
ALLOWED_ORIGIN=*
SYNC_SECRET=YOUR_SYNC_TOKEN
SYNC_TABLE=flow_images
SYNC_FOLDER=
SYNC_MAX_OBJECTS=2000
```

## Supabase Storage Policies

Allow anon uploads and reads for your bucket:

```sql
CREATE POLICY "Allow anon uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'flow-image');

CREATE POLICY "Allow anon reads"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'flow-image');
```

## Userscript Installation

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript.
3. Paste the contents of `flow-auto-uploader.user.js`.
4. Save and ensure the script is enabled.
5. Open a Flow project page. Uploads happen automatically.

## API Endpoint

```
POST /api/upload-flow-images
```

Example request body:

```json
{
  "images": [
    "https://storage.googleapis.com/ai-sandbox-videofx/image/EXAMPLE"
  ],
  "compressQuality": 85,
  "maxWidth": 1920,
  "maxHeight": 1920
}
```

## Deduplication

The API hashes the source URL and uses a deterministic file name, so identical URLs are not uploaded twice. The userscript also keeps a local cache of uploaded URLs to avoid repeat uploads during a browsing session.

## Optional Bookmarklet

If you need manual triggering, use the bookmarklet generator:

```
/bookmarklet-generator
```

## Storage → DB Sync (Template)

```
POST /api/sync-storage-to-db
```

Headers:

```
Authorization: Bearer YOUR_SYNC_TOKEN
```

Optional query params:

```
token=YOUR_SYNC_TOKEN
dryRun=1
```

Notes:
- The endpoint lists objects in `BUCKET_NAME`, filters `.jpg`, and inserts missing rows into `SYNC_TABLE`.
- Protect it with `SYNC_SECRET` and call it from a trusted backend or an external cron that can send the token.

Example (GitHub Actions cron):

```
curl -sS -X POST "https://YOUR_VERCEL_DOMAIN/api/sync-storage-to-db?token=${SYNC_SECRET}"
```
