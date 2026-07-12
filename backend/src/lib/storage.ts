import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';
import { stat, readdir, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import logger from './logger';

export const isR2Configured = () => {
    return !!(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET &&
        process.env.R2_PUBLIC_URL
    );
};

let s3Client: S3Client | null = null;

if (isR2Configured()) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });
}

/**
 * Uploads a single file to R2 if configured. Otherwise returns the local relative path.
 * Deletes the local file if uploaded to R2 successfully.
 */
export const uploadFileToStorage = async (
    localPath: string,
    folder: string,
    filename: string,
    mimeType?: string
): Promise<string> => {
    const localUrl = `/uploads/${folder}/${filename}`;

    // PDFs are authorization-protected by /uploads/pdfs. Publishing them on
    // R2_PUBLIC_URL would bypass enrollment checks. Keep them on the shared
    // private volume until a signed/private CDN adapter is configured.
    if (!canUsePublicObjectStorage(folder) || !isR2Configured() || !s3Client) {
        return localUrl;
    }

    const key = `uploads/${folder}/${filename}`;
    const fileStat = await stat(localPath);
    const body = createReadStream(localPath);

    const type = mimeType || (folder === 'images' ? 'image/webp' : 'application/pdf');

    try {
        if (fileStat.size > 50 * 1024 * 1024) {
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: process.env.R2_BUCKET!,
                    Key: key,
                    Body: body,
                    ContentType: type,
                },
            });
            await upload.done();
        } else {
            const command = new PutObjectCommand({
                Bucket: process.env.R2_BUCKET!,
                Key: key,
                Body: body,
                ContentType: type,
            });
            await s3Client.send(command);
        }

        // Delete local file after successful upload
        await unlink(localPath).catch(() => {});

        // Remove trailing slash if present in R2_PUBLIC_URL
        const baseUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
        return `${baseUrl}/${key}`;
    } catch (error) {
        logger.error({ error, key }, 'Falha no upload para R2; usando armazenamento local');
        // Fallback to local
        return localUrl;
    }
};

export function canUsePublicObjectStorage(folder: string): boolean {
    return folder !== 'pdfs';
}

/**
 * Uploads an entire folder (e.g., HLS directory) to R2 and deletes the local folder.
 */
export const uploadFolderToStorage = async (
    localDirPath: string,
    baseFolder: string // e.g. 'uploads/hls/video_id'
): Promise<void> => {
    if (!isR2Configured() || !s3Client) return;

    try {
        const files = await readdir(localDirPath, { recursive: true });

        for (const file of files) {
            const fullPath = path.join(localDirPath, file);
            const fileInfo = await stat(fullPath);

            if (fileInfo.isDirectory()) continue;

            const key = `${baseFolder}/${file.replace(/\\/g, '/')}`;
            const mimeType = file.endsWith('.m3u8')
                ? 'application/vnd.apple.mpegurl'
                : file.endsWith('.ts')
                    ? 'video/mp2t'
                    : 'application/octet-stream';

            const command = new PutObjectCommand({
                Bucket: process.env.R2_BUCKET!,
                Key: key,
                Body: createReadStream(fullPath),
                ContentType: mimeType,
            });

            await s3Client.send(command);
        }

        // Delete local folder after upload
        await rm(localDirPath, { recursive: true, force: true }).catch(() => {});
    } catch (error) {
        logger.error({ error, baseFolder }, 'Falha no upload da pasta HLS para R2');
    }
};

export const getHlsBaseUrl = (videoId: string): string => {
    if (isR2Configured()) {
        const baseUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
        return `${baseUrl}/uploads/hls/${videoId}`;
    }
    return `/hls/${videoId}`;
};
