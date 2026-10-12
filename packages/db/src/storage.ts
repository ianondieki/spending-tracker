import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Object storage for report artefacts (hero PNG, chart PNGs, PDF, HTML). Keys are `reports/<user>/<report>/<name>`.
 * The bucket is private: nothing here returns a permanent public URL (M6). Readers get a short-lived presigned URL
 * from `signedGetUrl`, or null when the backend has no presigning (the API then serves the bytes itself through a
 * short-lived signed route).
 */
export interface Storage {
  readonly kind: 's3' | 'fs' | 'memory';
  put(key: string, body: Uint8Array | string, contentType: string): Promise<{ key: string }>;
  get(key: string): Promise<Uint8Array>;
  /** A presigned GET valid for `ttlSeconds`, or null when this backend cannot presign. */
  signedGetUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

export const ARTEFACT_URL_TTL_SECONDS = 15 * 60;

export function contentTypeFor(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  if (key.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

/** Artefact keys the API will ever serve: inside one report's folder, one file deep, no traversal. */
export const ARTEFACT_KEY_PATTERN = /^reports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(charts\/)?[a-z0-9_.-]{1,80}$/;

/** Local-filesystem storage for development; the API serves its objects through the signed artefact route. */
export class FsStorage implements Storage {
  readonly kind = 'fs' as const;
  constructor(private readonly dir: string) {}

  private pathFor(key: string): string {
    const safe = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return join(resolve(this.dir), safe);
  }

  async put(key: string, body: Uint8Array | string, _contentType: string): Promise<{ key: string }> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async signedGetUrl(_key: string, _ttlSeconds: number): Promise<string | null> {
    return null;
  }
}

/** In-memory fake for unit tests. */
export class MemoryStorage implements Storage {
  readonly kind = 'memory' as const;
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<{ key: string }> {
    this.objects.set(key, { body: typeof body === 'string' ? new TextEncoder().encode(body) : body, contentType });
    return { key };
  }

  async get(key: string): Promise<Uint8Array> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`no object ${key}`);
    return o.body;
  }

  async signedGetUrl(_key: string, _ttlSeconds: number): Promise<string | null> {
    return null;
  }
}

export interface S3Options {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
}

/** S3-compatible storage (MinIO locally), private bucket, presigned reads. Path-style so MinIO works without DNS buckets. */
export class S3Storage implements Storage {
  readonly kind = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly opts: S3Options) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
    });
  }

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<{ key: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType }));
    return { key };
  }

  async signedGetUrl(key: string, ttlSeconds: number): Promise<string | null> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }), { expiresIn: ttlSeconds });
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    if (!res.Body) throw new Error(`no object ${key}`);
    return res.Body.transformToByteArray();
  }
}
