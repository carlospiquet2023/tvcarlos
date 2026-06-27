import { z } from 'zod';
import { ValidationError } from '../application/errors.js';

export const loginSchema = z.strictObject({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(1).max(128),
});

export const credentialsSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newUsername: z.string().trim().min(3).max(80),
  newPassword: z.string().min(14).max(128),
});

export const newsSchema = z.strictObject({ text: z.string().trim().min(1).max(500) });

const secureAssetUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Use uma URL HTTPS ou um arquivo enviado pelo painel.');

const secureDestinationUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Use uma URL HTTPS válida para o site do parceiro.');

const navigationUrl = z.string().trim().min(1).max(2048).refine((value) => {
  if (value.includes('..') || value.includes('\\') || /\s/.test(value) || value.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }
  return /^\/?[a-zA-Z0-9][a-zA-Z0-9._~!$&'()*+,;=@%\/-]*(?:\?[^\s#]*)?(?:#[^\s]*)?$/.test(value);
}, 'Use um caminho interno ou uma URL HTTPS válida.');

const youtubeHosts = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'youtu.be', 'www.youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/;

function hasValidYouTubeVideo(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const [route = '', routeId = ''] = url.pathname.split('/').filter(Boolean);
  const id = host === 'youtu.be' || host === 'www.youtu.be'
    ? route
    : route === 'watch'
      ? (url.searchParams.get('v') || '')
      : ['shorts', 'embed', 'live'].includes(route)
        ? routeId
        : '';
  return youtubeIdPattern.test(id);
}

const videoReference = z.string().trim().min(1).max(2048).refine((value) => {
  if (/^[a-zA-Z0-9._-]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return youtubeHosts.has(url.hostname.toLowerCase()) ? hasValidYouTubeVideo(url) : true;
  } catch {
    return false;
  }
}, 'Use um vídeo enviado, uma URL HTTPS ou uma URL válida do YouTube.');

const youtubeLiveReference = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && youtubeHosts.has(url.hostname.toLowerCase()) && hasValidYouTubeVideo(url);
  } catch {
    return false;
  }
}, 'Use uma URL HTTPS válida de live ou vídeo do YouTube.');

export const programSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(''),
  video: videoReference,
});

export const brandingSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(160),
  tagline: z.string().trim().min(1).max(160),
  watermarkText: z.string().trim().max(300),
  logoText: z.string().trim().max(160),
  logoUrl: secureAssetUrl,
  scheduleTitle: z.string().trim().min(1).max(160),
  tickerLabel: z.string().trim().min(1).max(80),
  partnerLabel: z.string().trim().min(1).max(80),
  liveSource: z.enum(['obs', 'youtube']).default('obs'),
  liveYoutubeUrl: youtubeLiveReference.default(''),
  liveTitle: z.string().trim().min(1).max(160),
  liveDescription: z.string().trim().max(300),
  loopTitle: z.string().trim().min(1).max(160),
  loopDescription: z.string().trim().max(300),
  legalName: z.string().trim().min(3).max(180),
  legalEmail: z.email().max(254),
  legalCnpj: z.string().trim().regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'Informe o CNPJ no formato 00.000.000/0000-00.'),
  legalCity: z.string().trim().min(2).max(120),
  legalPhone: z.string().trim().min(8).max(30),
});

export const headerLinkSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  url: navigationUrl,
});

export const partnerSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  logoUrl: secureAssetUrl.refine(Boolean, 'O logo é obrigatório.'),
  destinationUrl: secureDestinationUrl.default(''),
});

export const orderSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, 'A lista contém itens duplicados.'),
});

export const auditQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const idSchema = z.uuid();

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new ValidationError(message);
  }
  return result.data;
}
