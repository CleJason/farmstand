import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  // favicon formats
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/svg+xml': '.svg',
};
const ALLOWED_TYPES = Object.keys(EXTENSIONS);
// What customers may upload (review photos): ordinary photos only
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** A customer adding photos to a review: their review link must be valid and not used yet. */
async function canUploadReviewPhoto(token: string) {
  if (!token) return false;
  const order = await prisma.order.findUnique({ where: { reviewToken: token }, select: { id: true } });
  return !!order && !(await prisma.review.findUnique({ where: { orderId: order.id }, select: { id: true } }));
}
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  const session = await auth();
  const admin = session?.user?.role === 'ADMIN';

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!admin && !(await canUploadReviewPhoto(String(formData.get('reviewToken') ?? '')))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!admin && !PHOTO_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Please choose a photo (JPEG, PNG, WebP or GIF)' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF, ICO, SVG' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = EXTENSIONS[file.type];
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

    return NextResponse.json({ url: `/uploads/${uniqueName}` });
  } catch (err: any) {
    console.error('[upload] error:', err);
    return NextResponse.json(
      { error: err.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
