import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import type { AuditRepository, ContentRepository, MediaStorage } from './ports.js';
import { ValidationError } from './errors.js';
import type { MediaKind } from '../domain/models.js';
import type { RequestAuditContext } from './auth-service.js';

const executeFile = promisify(execFile);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/mpeg']);
const DOCUMENT_TYPES = new Set(['application/pdf']);

export class MediaService {
  constructor(
    private readonly storage: MediaStorage,
    private readonly content: ContentRepository,
    private readonly audit: AuditRepository,
  ) {}

  async store(
    kind: MediaKind,
    uploadedPath: string,
    originalName: string,
    actor: RequestAuditContext & { userId: string },
  ) {
    const workDirectory = await mkdtemp(join(tmpdir(), 'tvcarlos-media-'));
    let sourcePath = uploadedPath;
    let mimeType: string;
    let extension: string;
    let stored: Awaited<ReturnType<MediaStorage['store']>> | undefined;

    try {
      const detected = await fileTypeFromFile(uploadedPath);
      if (!detected) throw new ValidationError('Não foi possível identificar o tipo real do arquivo.');

      if (kind === 'image') {
        if (!IMAGE_TYPES.has(detected.mime)) throw new ValidationError('Formato de imagem não permitido.');
        sourcePath = join(workDirectory, 'sanitized.webp');
        await sharp(uploadedPath, { failOn: 'warning', limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90, effort: 4 })
          .toFile(sourcePath);
        mimeType = 'image/webp';
        extension = 'webp';
      } else if (kind === 'video') {
        if (!VIDEO_TYPES.has(detected.mime)) throw new ValidationError('Formato de vídeo não permitido.');
        await validateVideo(uploadedPath);
        mimeType = detected.mime;
        extension = detected.ext === 'mov' ? 'mov' : detected.ext;
      } else {
        if (!DOCUMENT_TYPES.has(detected.mime)) throw new ValidationError('Envie um arquivo PDF válido.');
        mimeType = 'application/pdf';
        extension = 'pdf';
      }

      const fileStat = await stat(sourcePath);
      const sha256 = await digestFile(sourcePath);
      stored = await this.storage.store(kind, sourcePath, extension);
      const asset = {
        id: randomUUID(),
        kind,
        storageKey: stored.key,
        mimeType,
        byteSize: fileStat.size,
        sha256,
        originalName: sanitizeOriginalName(originalName),
        createdBy: actor.userId,
        createdAt: new Date(),
      } as const;
      await this.content.createMedia(asset);
      await this.audit.append({
        actorUserId: actor.userId,
        action: 'media.uploaded',
        targetType: 'media',
        targetId: asset.id,
        requestId: actor.requestId,
        ip: actor.ip,
        metadata: { kind, mimeType, byteSize: fileStat.size, sha256 },
      });
      return { id: asset.id, key: stored.key, url: stored.publicUrl, mimeType, byteSize: fileStat.size };
    } catch (error) {
      if (stored) await this.storage.remove(kind, stored.key).catch(() => undefined);
      throw error;
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
      await rm(uploadedPath, { force: true });
    }
  }
}

async function validateVideo(filePath: string): Promise<void> {
  try {
    const { stdout } = await executeFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-show_entries', 'format=duration', '-of', 'json', filePath],
      { timeout: 20_000, maxBuffer: 1_000_000, windowsHide: true },
    );
    const probe = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
    const hasVideo = probe.streams?.some((stream) => stream.codec_type === 'video');
    const duration = Number(probe.format?.duration);
    if (!hasVideo || !Number.isFinite(duration) || duration <= 0 || duration > 43_200) {
      throw new Error('invalid probe');
    }
  } catch {
    throw new ValidationError('O vídeo está corrompido, não possui faixa de vídeo ou excede 12 horas.');
  }
}

async function digestFile(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

function sanitizeOriginalName(name: string): string {
  return basename(name).normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255) || 'arquivo';
}
