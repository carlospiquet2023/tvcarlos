import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { MediaStorage } from '../../application/ports.js';
import type { MediaKind } from '../../domain/models.js';

export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly imageDirectory: string,
    private readonly videoDirectory: string,
  ) {}

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.imageDirectory, { recursive: true }),
      mkdir(this.videoDirectory, { recursive: true }),
    ]);
  }

  async store(kind: MediaKind, sourcePath: string, extension: string) {
    const directory = kind === 'image' ? this.imageDirectory : this.videoDirectory;
    const key = `${randomUUID()}.${extension.replace(/^\./, '')}`;
    const partialPath = path.join(directory, `.${key}.partial`);
    const finalPath = path.join(directory, key);
    await copyFile(sourcePath, partialPath);
    await rename(partialPath, finalPath);
    return { key, publicUrl: kind === 'image' ? `/uploads/${key}` : `/videos/${key}` };
  }

  async remove(kind: MediaKind, key: string): Promise<void> {
    const safeKey = path.basename(key);
    const directory = kind === 'image' ? this.imageDirectory : this.videoDirectory;
    await rm(path.join(directory, safeKey), { force: true });
  }
}

