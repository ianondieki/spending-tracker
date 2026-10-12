/** Storage selection from the environment, shared by the API and the worker: all four S3 variables or none. */
import { FsStorage, S3Storage, type Storage } from './storage.js';

export interface StorageConfig {
  readonly s3: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string } | null;
  readonly storageDir: string;
}

const nonEmpty = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);

export function readStorageConfig(env: Readonly<Record<string, string | undefined>>): StorageConfig {
  const endpoint = nonEmpty(env['S3_ENDPOINT']);
  const bucket = nonEmpty(env['S3_BUCKET']);
  const accessKey = nonEmpty(env['S3_ACCESS_KEY']);
  const secretKey = nonEmpty(env['S3_SECRET_KEY']);
  const any = endpoint || bucket || accessKey || secretKey;
  const all = endpoint && bucket && accessKey && secretKey;
  if (any && !all) throw new Error('S3 is partially configured; set all of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY or none (fail closed)');
  return {
    s3: all ? { endpoint, bucket, accessKey, secretKey, region: env['S3_REGION'] ?? 'us-east-1' } : null,
    storageDir: env['STORAGE_DIR'] ?? '.hesabu-storage',
  };
}

export function createStorage(env: Readonly<Record<string, string | undefined>>): Storage {
  const c = readStorageConfig(env);
  return c.s3 ? new S3Storage(c.s3) : new FsStorage(c.storageDir);
}
