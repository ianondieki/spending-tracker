import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Object storage for report artefacts (hero PNG, chart PNGs, PDF, HTML). Keys are `reports/<user>/<report>/<name>`. */
export interface Storage {
  put(key: string, body: Uint8Array | string, contentType: string): Promise<{ url: string }>;
  get(key: string): Promise<Uint8Array>;
}

/** Local-filesystem fake for development and tests. URLs point at the app's artefact route. */
export class FsStorage implements Storage {
  constructor(
    private readonly dir: string,
    private readonly baseUrl: string,
  ) {}

  private pathFor(key: string): string {
    const safe = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return join(resolve(this.dir), safe);
  }

  async put(key: string, body: Uint8Array | string, _contentType: string): Promise<{ url: string }> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { url: `${this.baseUrl}/artefacts/${key}` };
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }
}

/** In-memory fake for unit tests. */
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  constructor(private readonly baseUrl = 'https://storage.test') {}

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<{ url: string }> {
    this.objects.set(key, { body: typeof body === 'string' ? new TextEncoder().encode(body) : body, contentType });
    return { url: `${this.baseUrl}/${key}` };
  }

  async get(key: string): Promise<Uint8Array> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`no object ${key}`);
    return o.body;
  }
}

export interface S3Options {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  publicBaseUrl: string | null;
}

/** S3-compatible storage (MinIO locally). Path-style addressing so MinIO works without DNS buckets. */
export class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly opts: S3Options) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
    });
  }

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<{ url: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType }));
    const base = this.opts.publicBaseUrl ?? `${this.opts.endpoint.replace(/\/$/, '')}/${this.opts.bucket}`;
    return { url: `${base}/${key}` };
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    if (!res.Body) throw new Error(`no object ${key}`);
    return res.Body.transformToByteArray();
  }
}
