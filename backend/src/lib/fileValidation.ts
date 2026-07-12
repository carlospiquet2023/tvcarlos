import fsp from 'fs/promises';

async function readHeader(filePath: string, size = 32): Promise<Buffer> {
    const handle = await fsp.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(size);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

export async function isPdfFile(filePath: string): Promise<boolean> {
    const header = await readHeader(filePath, 8);
    return header.subarray(0, 5).toString('ascii') === '%PDF-';
}

export async function isSafeWebImage(filePath: string): Promise<boolean> {
    const header = await readHeader(filePath, 32);
    if (header.length < 12) return false;

    const png = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const gif = ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString('ascii'));
    const webp = header.subarray(0, 4).toString('ascii') === 'RIFF'
        && header.subarray(8, 12).toString('ascii') === 'WEBP';
    const avif = header.subarray(4, 12).toString('ascii').startsWith('ftypavi');

    return png || jpeg || gif || webp || avif;
}

export async function isSpreadsheetFile(filePath: string): Promise<boolean> {
    const header = await readHeader(filePath, 8);
    const zip = header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const ole = header.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    return zip || ole;
}

export async function removeFileQuietly(filePath?: string): Promise<void> {
    if (!filePath) return;
    await fsp.unlink(filePath).catch(() => undefined);
}
