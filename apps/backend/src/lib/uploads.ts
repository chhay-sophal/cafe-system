import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import { env } from '../env.js';
import { backendRoot } from '../paths.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Render's filesystem is ephemeral (without a paid persistent disk add-on),
// so hosted deploys need object storage; on-prem keeps writing to local disk
// as before. Presence of all R2 vars is what switches this, not NODE_ENV -
// keeps dev/on-prem/hosted on one path.
const usingR2 = Boolean(
  env.R2_BUCKET && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_PUBLIC_URL,
);

const s3Client = usingR2
  ? new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  })
  : null;

const fileFilter: NonNullable<multer.Options['fileFilter']> = (_req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    cb(new Error('Only JPEG, PNG, and WEBP images are allowed'));
    return;
  }
  cb(null, true);
};

export const productImageUpload = multer({
  storage: usingR2
    ? multer.memoryStorage()
    : multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(backendRoot, 'uploads', 'products');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

export async function saveProductImage(file: Express.Multer.File): Promise<string> {
  if (usingR2 && s3Client) {
    const key = `products/${randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    return `${env.R2_PUBLIC_URL}/${key}`;
  }

  return `/uploads/products/${file.filename}`;
}
