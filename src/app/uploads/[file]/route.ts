import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

// Next standalone only serves public/ files present at build time, so
// runtime uploads (written to the Docker volume) are served from here.
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const name = path.basename(file);
  const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()];
  if (!contentType) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const data = await readFile(path.join(process.cwd(), 'public', 'uploads', name));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Uploaded SVGs can contain script; never let an upload run code on this site
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
