/* eslint-disable @typescript-eslint/no-require-imports */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import logger from '../lib/logger';

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
}

const ALL_QUALITIES = [
    { width: 640, height: 360, bitrate: '800k', name: '360p' },
    { width: 1280, height: 720, bitrate: '2800k', name: '720p' },
    { width: 1920, height: 1080, bitrate: '5000k', name: '1080p' }
];

interface ProbeResult {
    width: number;
    height: number;
    hasAudio: boolean;
}

interface FFProbeStream {
    codec_type: string;
    width?: number;
    height?: number;
}

interface FFProbeMetadata {
    streams: FFProbeStream[];
}

function probeVideo(filePath: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err: Error | null, metadata: FFProbeMetadata) => {
            if (err) return reject(err);
            const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
            const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
            resolve({
                width: videoStream?.width || 1920,
                height: videoStream?.height || 1080,
                hasAudio: !!audioStream
            });
        });
    });
}

interface PgBossJob {
    id?: string;
    data?: { videoId: string; filePath: string };
    videoId?: string;
    filePath?: string;
}

export async function processVideoJob(input: PgBossJob | PgBossJob[]) {
    // pg-boss v12 passa um array de jobs para o worker
    const job = Array.isArray(input) ? input[0] : input;
    const videoId = job.data?.videoId ?? job.videoId;
    const filePath = job.data?.filePath ?? job.filePath;

    if (!videoId || !filePath) {
        logger.error({ job }, 'Job inválido');
        return;
    }

    const hlsStorage = process.env.HLS_STORAGE_PATH || './uploads/hls';
    const outDir = path.resolve(hlsStorage, videoId);
    const absoluteInputPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    try {
        await prisma.video.update({
            where: { id: videoId },
            data: { status: 'PROCESSING' }
        });

        logger.info({ videoId, inputPath: absoluteInputPath, outputDir: outDir }, 'Iniciando processamento FFmpeg');

        await generateHls(absoluteInputPath, outDir);

        const masterPlaylistPath = `/hls/${videoId}/master.m3u8`;

        await prisma.video.update({
            where: { id: videoId },
            data: {
                status: 'READY',
                hlsUrl: masterPlaylistPath
            }
        });

        logger.info({ videoId }, 'Processamento HLS concluído');

    } catch (error) {
        logger.error({ videoId, error }, 'Erro ao processar vídeo');
        await prisma.video.update({
            where: { id: videoId },
            data: { status: 'ERROR' }
        });
        throw error;
    }
}

async function generateHls(inputFilePath: string, outputDir: string): Promise<void> {
    const probe = await probeVideo(inputFilePath);
    logger.info({ width: probe.width, height: probe.height, hasAudio: probe.hasAudio }, 'Resolução do input');

    // Filtra qualidades: só gera resoluções menores ou iguais à do input
    // Se nenhuma qualidade couber, gera na resolução original
    let qualities = ALL_QUALITIES.filter(q => q.height <= probe.height);
    if (qualities.length === 0) {
        // Vídeo muito pequeno — gera uma única qualidade na resolução original (par)
        const w = probe.width % 2 === 0 ? probe.width : probe.width - 1;
        const h = probe.height % 2 === 0 ? probe.height : probe.height - 1;
        qualities = [{ width: w, height: h, bitrate: '800k', name: `${h}p` }];
    }

    logger.info({ qualities: qualities.map(q => q.name) }, 'Qualidades a gerar');

    // Processa cada qualidade individualmente (compatível com Windows)
    for (let i = 0; i < qualities.length; i++) {
        const q = qualities[i];
        const vDir = path.join(outputDir, `v${i}`);
        if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

        const segmentFilename = path.join(vDir, 'fileSequence%d.ts').replace(/\\/g, '/');
        const playlistOutput = path.join(vDir, 'prog_index.m3u8').replace(/\\/g, '/');

        await new Promise<void>((resolve, reject) => {
            let killed = false;
            const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos por qualidade

            const opts: string[] = [
                `-map`, `0:v:0`,
            ];
            if (probe.hasAudio) {
                opts.push(`-map`, `0:a:0`);
            }
            opts.push(
                `-s:v:0`, `${q.width}x${q.height}`,
                `-b:v:0`, q.bitrate,
                `-c:v`, `libx264`,
                `-crf`, `23`,
                `-preset`, `veryfast`,
                `-profile:v`, `main`,
                `-g`, `48`,
                `-sc_threshold`, `0`
            );
            if (probe.hasAudio) {
                opts.push(
                    `-b:a`, `128k`,
                    `-c:a`, `aac`,
                    `-ar`, `48000`
                );
            }
            opts.push(
                `-f`, `hls`,
                `-hls_time`, `10`,
                `-hls_playlist_type`, `vod`,
                `-hls_flags`, `independent_segments`,
                `-hls_segment_type`, `mpegts`,
                `-hls_segment_filename`, segmentFilename
            );

            const command = ffmpeg(inputFilePath)
                .outputOptions(opts)
                .output(playlistOutput)
                .on('start', (cmd: string) => logger.debug({ quality: q.name, cmd }, 'FFmpeg started'))
                .on('end', () => {
                    clearTimeout(timer);
                    logger.info({ quality: q.name }, 'Qualidade concluída');
                    resolve();
                })
                .on('error', (err: Error) => {
                    clearTimeout(timer);
                    if (killed) {
                        reject(new Error(`FFmpeg [${q.name}] abortado por timeout (${FFMPEG_TIMEOUT_MS / 60000} min)`));
                    } else {
                        logger.error({ quality: q.name, err }, 'FFmpeg error');
                        reject(err);
                    }
                });

            command.run();

            const timer = setTimeout(() => {
                killed = true;
                command.kill('SIGKILL');
            }, FFMPEG_TIMEOUT_MS);
        });
    }

    // Gera master playlist manualmente
    let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
    for (let i = 0; i < qualities.length; i++) {
        const q = qualities[i];
        const bandwidth = parseInt(q.bitrate) * 1000;
        masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${q.width}x${q.height}\n`;
        masterContent += `v${i}/prog_index.m3u8\n`;
    }
    fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterContent);
    logger.info('Master playlist gerada.');
}
