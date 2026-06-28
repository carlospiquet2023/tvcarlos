import { constants } from 'node:fs';
import { access, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { MediaStorage } from '../../application/ports.js';
import type { MediaKind } from '../../domain/models.js';

export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly imageDirectory: string,
    private readonly videoDirectory: string,
    private readonly documentDirectory: string,
  ) {}

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.imageDirectory, { recursive: true }),
      mkdir(this.videoDirectory, { recursive: true }),
      mkdir(this.documentDirectory, { recursive: true }),
    ]);
  }

  async healthCheck() {
    const directories = [
      ['images', this.imageDirectory],
      ['videos', this.videoDirectory],
      ['documents', this.documentDirectory],
    ] as const;
    const failed: string[] = [];
    await Promise.all(directories.map(async ([name, directory]) => {
      try {
        await access(directory, constants.R_OK | constants.W_OK);
      } catch {
        failed.push(name);
      }
    }));

    return {
      provider: 'local' as const,
      status: failed.length ? 'error' as const : 'ok' as const,
      detail: failed.length
        ? `Volume local sem leitura/escrita: ${failed.join(', ')}.`
        : 'Volumes locais de imagem, vídeo e documentos acessíveis.',
      checkedAt: new Date(),
      metadata: {
        imageDirectory: this.imageDirectory,
        videoDirectory: this.videoDirectory,
        documentDirectory: this.documentDirectory,
      },
    };
  }

  async store(kind: MediaKind, sourcePath: string, extension: string) {
    const directory = this.directoryFor(kind);
    const key = `${randomUUID()}.${extension.replace(/^\./, '')}`;
    const partialPath = path.join(directory, `.${key}.partial`);
    const finalPath = path.join(directory, key);
    await copyFile(sourcePath, partialPath);
    await rename(partialPath, finalPath);
    return { key, publicUrl: this.publicPathFor(kind, key) };
  }

  async remove(kind: MediaKind, key: string): Promise<void> {
    const safeKey = path.basename(key);
    const directory = this.directoryFor(kind);
    await rm(path.join(directory, safeKey), { force: true });
  }

  private directoryFor(kind: MediaKind) {
    if (kind === 'image') return this.imageDirectory;
    if (kind === 'video') return this.videoDirectory;
    return this.documentDirectory;
  }

  private publicPathFor(kind: MediaKind, key: string) {
    if (kind === 'image') return `/uploads/${key}`;
    if (kind === 'video') return `/videos/${key}`;
    return `/documents/${key}`;
  }
}
