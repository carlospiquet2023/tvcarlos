import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { MediaStorage } from '../../application/ports.js';
import type { MediaKind } from '../../domain/models.js';

export class R2MediaStorage implements MediaStorage {
  private readonly client: S3Client;

  constructor(
    private readonly accountId: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly bucket: string,
    private readonly publicUrl: string,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
  }

  async initialize(): Promise<void> {
    // Pode ser usado no futuro para verificar acesso ao bucket
  }

  async healthCheck() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal: controller.signal });
      return {
        provider: 'r2' as const,
        status: 'ok' as const,
        detail: 'Cloudflare R2 acessível e bucket respondendo.',
        checkedAt: new Date(),
        metadata: { bucket: this.bucket, publicUrl: this.publicUrl },
      };
    } catch (error) {
      return {
        provider: 'r2' as const,
        status: 'error' as const,
        detail: error instanceof Error
          ? `Cloudflare R2 não respondeu corretamente: ${error.message}`
          : 'Cloudflare R2 não respondeu corretamente.',
        checkedAt: new Date(),
        metadata: { bucket: this.bucket, publicUrl: this.publicUrl },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async store(kind: MediaKind, sourcePath: string, extension: string) {
    const key = `${prefixFor(kind)}/${randomUUID()}.${extension.replace(/^\./, '')}`;
    
    // Mapeamento básico; real validação do tipo já ocorreu no media-service.ts
    const mimeType = kind === 'image'
      ? 'image/webp'
      : kind === 'document'
        ? 'application/pdf'
        : `video/${extension === 'mov' ? 'quicktime' : 'mp4'}`;
    const fileStat = await stat(sourcePath);
    const body = createReadStream(sourcePath);

    if (fileStat.size > 50 * 1024 * 1024) {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
        },
      });
      await upload.done();
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      });
      await this.client.send(command);
    }

    return { key, publicUrl: `${this.publicUrl}/${key}` };
  }

  async remove(kind: MediaKind, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }
}

function prefixFor(kind: MediaKind) {
  if (kind === 'image') return 'logo';
  if (kind === 'video') return 'videos';
  return 'documents';
}
