import { execSync } from 'child_process';
import { config } from './config.js';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { lookup } from 'mime-types';

// Cloudflare R2 - S3 compatible (10GB free)
// Using wrangler CLI for simplicity

function getBucketName(): string {
  const bucket = (config.get('r2') as any)?.bucket;
  if (!bucket) throw new Error('R2 bucket not configured. Run: freestack files setup');
  return bucket;
}

export function createBucket(name: string) {
  execSync(`wrangler r2 bucket create ${name}`, { encoding: 'utf-8' });
}

export function listBuckets(): string {
  return execSync('wrangler r2 bucket list', { encoding: 'utf-8' });
}

export function uploadFile(localPath: string, remotePath?: string): string {
  const bucket = getBucketName();
  const fileName = remotePath || basename(localPath);
  execSync(`wrangler r2 object put "${bucket}/${fileName}" --file="${localPath}"`, {
    encoding: 'utf-8',
  });

  const accountId = config.get('cloudflare')?.accountId;
  // R2 public URL (if public access enabled) or presigned
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${fileName}`;
}

export function downloadFile(remotePath: string, localPath: string) {
  const bucket = getBucketName();
  execSync(`wrangler r2 object get "${bucket}/${remotePath}" --file="${localPath}"`, {
    encoding: 'utf-8',
  });
}

export function deleteFile(remotePath: string) {
  const bucket = getBucketName();
  execSync(`wrangler r2 object delete "${bucket}/${remotePath}"`, {
    encoding: 'utf-8',
  });
}

export function listObjects(prefix?: string): string {
  const bucket = getBucketName();
  const prefixFlag = prefix ? `--prefix="${prefix}"` : '';
  return execSync(`wrangler r2 object list "${bucket}" ${prefixFlag}`, {
    encoding: 'utf-8',
  });
}

export function getFileInfo(localPath: string) {
  const stat = statSync(localPath);
  return {
    name: basename(localPath),
    size: stat.size,
    mime_type: lookup(localPath) || 'application/octet-stream',
  };
}
