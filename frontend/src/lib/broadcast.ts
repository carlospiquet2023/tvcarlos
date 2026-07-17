import axios from 'axios';
import api from './api';
import { resolveMediaUrl } from './urls';

export type BroadcastMode = 'live' | 'loop' | 'offline' | 'program';
export type BroadcastMediaKind = 'hls' | 'video' | 'youtube' | 'external';

export interface BroadcastSettings {
    title: string;
    description: string;
    liveUrl: string;
    loopUrl: string;
    posterUrl: string;
    logoUrl: string;
    accentColor: string;
    liveTitle: string;
    loopTitle: string;
    liveSource: 'OBS' | 'YOUTUBE';
    liveYoutubeUrl: string;
}

export interface BroadcastProgram {
    id: string;
    title: string;
    description: string;
    category: string;
    startAt: string | null;
    endAt: string | null;
    sourceUrl: string;
    posterUrl: string;
    active: boolean;
    order: number;
}

export interface BroadcastTickerItem {
    id: string;
    text: string;
    href: string;
    active: boolean;
    order: number;
}

export interface BroadcastPartner {
    id: string;
    name: string;
    logoUrl: string;
    destinationUrl: string;
    active: boolean;
    order: number;
}

export interface BroadcastStatus {
    live: boolean;
    loop: boolean;
    checkedAt: string;
}

export interface BroadcastPublicData {
    settings: BroadcastSettings;
    programs: BroadcastProgram[];
    tickers: BroadcastTickerItem[];
    partners: BroadcastPartner[];
    status: BroadcastStatus;
}

export interface BroadcastSelection {
    mode: BroadcastMode;
    title: string;
    description: string;
    url: string;
    posterUrl: string;
    kind: BroadcastMediaKind;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as JsonRecord
        : {};
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]): string {
    const match = values.find((value) => typeof value === 'string' && value.trim());
    return typeof match === 'string' ? match.trim() : '';
}

function booleanValue(value: unknown, fallback = true): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableDate(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

export const absoluteMediaUrl = resolveMediaUrl;

export function mediaKind(url: string): BroadcastMediaKind {
    if (/youtu(?:\.be|be\.com)|youtube-nocookie\.com/i.test(url)) return 'youtube';
    if (/\.m3u8(?:$|\?)/i.test(url)) return 'hls';
    if (/\.(?:mp4|webm|ogg)(?:$|\?)/i.test(url)) return 'video';
    return 'external';
}

function normalizeSettings(value: unknown): BroadcastSettings {
    const item = record(value);
    return {
        title: stringValue(item.title, item.companyName, item.platformName, 'Campus ao Vivo'),
        description: stringValue(item.description, item.tagline, 'Conhecimento, encontros e programação em um único sinal.'),
        liveUrl: stringValue(item.liveUrl, item.liveHlsUrl, item.liveStreamUrl),
        loopUrl: stringValue(item.loopUrl, item.loopHlsUrl, item.loopStreamUrl),
        posterUrl: stringValue(item.posterUrl, item.backgroundUrl),
        logoUrl: stringValue(item.logoUrl),
        accentColor: stringValue(item.accentColor, item.primaryColor, '#00c4b5'),
        liveTitle: stringValue(item.liveTitle, 'Campus ao vivo agora'),
        loopTitle: stringValue(item.loopTitle, 'Programação contínua'),
        liveSource: stringValue(item.liveSource) === 'YOUTUBE' ? 'YOUTUBE' : 'OBS',
        liveYoutubeUrl: stringValue(item.liveYoutubeUrl),
    };
}

function normalizeProgram(value: unknown, index: number): BroadcastProgram {
    const item = record(value);
    return {
        id: stringValue(item.id, item.slug, `program-${index}`),
        title: stringValue(item.title, item.name, `Programa ${index + 1}`),
        description: stringValue(item.description, item.desc),
        category: stringValue(item.category, item.channel, 'Campus'),
        startAt: nullableDate(item.startAt ?? item.startsAt ?? item.scheduledAt),
        endAt: nullableDate(item.endAt ?? item.endsAt),
        sourceUrl: stringValue(item.sourceUrl, item.videoUrl, item.video, item.url),
        posterUrl: stringValue(item.posterUrl, item.poster, item.thumbnailUrl),
        active: booleanValue(item.active ?? item.published ?? item.enabled),
        order: numberValue(item.order ?? item.position, index),
    };
}

function normalizeTicker(value: unknown, index: number): BroadcastTickerItem {
    const item = record(value);
    return {
        id: stringValue(item.id, `ticker-${index}`),
        text: stringValue(item.text, item.message, item.title, value),
        href: stringValue(item.href, item.url),
        active: booleanValue(item.active ?? item.published ?? item.enabled),
        order: numberValue(item.order ?? item.position, index),
    };
}

function normalizePartner(value: unknown, index: number): BroadcastPartner {
    const item = record(value);
    return {
        id: stringValue(item.id, `partner-${index}`),
        name: stringValue(item.name, item.title, `Parceiro ${index + 1}`),
        logoUrl: stringValue(item.logoUrl, item.imageUrl, item.logo),
        destinationUrl: stringValue(item.destinationUrl, item.href, item.url),
        active: booleanValue(item.active ?? item.published ?? item.enabled),
        order: numberValue(item.order ?? item.position, index),
    };
}

export function normalizeBroadcastData(payload: unknown): BroadcastPublicData {
    const root = record(payload);
    const status = record(root.status);
    const programs = list(root.programs ?? root.schedule ?? root.agenda)
        .map(normalizeProgram)
        .filter((item) => item.active)
        .sort((a, b) => a.order - b.order);
    const tickers = list(root.tickers ?? root.ticker ?? root.news)
        .map(normalizeTicker)
        .filter((item) => item.active && item.text)
        .sort((a, b) => a.order - b.order);
    const partners = list(root.partners)
        .map(normalizePartner)
        .filter((item) => item.active)
        .sort((a, b) => a.order - b.order);

    return {
        settings: normalizeSettings(root.settings ?? root.branding),
        programs,
        tickers,
        partners,
        status: {
            live: booleanValue(status.live ?? root.live, false),
            loop: booleanValue(status.loop ?? root.loop, false),
            checkedAt: stringValue(status.checkedAt, root.updatedAt, new Date().toISOString()),
        },
    };
}

export async function fetchPublicBroadcast(signal?: AbortSignal): Promise<BroadcastPublicData> {
    try {
        const response = await api.get('/api/broadcast/public', { signal });
        return normalizeBroadcastData(response.data);
    } catch (error: unknown) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
        const response = await api.get('/api/broadcast', { signal });
        return normalizeBroadcastData(response.data);
    }
}

export function defaultBroadcastSelection(data: BroadcastPublicData): BroadcastSelection {
    const { settings, status } = data;
    if (status.live && (settings.liveUrl || settings.liveSource === 'YOUTUBE')) {
        const isYoutube = settings.liveSource === 'YOUTUBE';
        return {
            mode: 'live',
            title: settings.liveTitle,
            description: 'Transmissão em tempo real',
            url: isYoutube ? absoluteMediaUrl(settings.liveYoutubeUrl) : absoluteMediaUrl(settings.liveUrl),
            posterUrl: absoluteMediaUrl(settings.posterUrl),
            kind: isYoutube ? 'youtube' : mediaKind(settings.liveUrl),
        };
    }
    if (status.loop && settings.loopUrl) {
        return {
            mode: 'loop',
            title: settings.loopTitle,
            description: 'Conteúdo selecionado para você, 24 horas por dia',
            url: absoluteMediaUrl(settings.loopUrl),
            posterUrl: absoluteMediaUrl(settings.posterUrl),
            kind: mediaKind(settings.loopUrl),
        };
    }
    return {
        mode: 'offline',
        title: 'Sinal temporariamente indisponível',
        description: 'A agenda e os conteúdos do Campus continuam disponíveis.',
        url: '',
        posterUrl: absoluteMediaUrl(settings.posterUrl),
        kind: 'external',
    };
}

export function selectionFromProgram(program: BroadcastProgram): BroadcastSelection {
    return {
        mode: 'program',
        title: program.title,
        description: program.description || program.category,
        url: absoluteMediaUrl(program.sourceUrl),
        posterUrl: absoluteMediaUrl(program.posterUrl),
        kind: mediaKind(program.sourceUrl),
    };
}

export function safeExternalUrl(value: string): string {
    if (!value) return '';
    try {
        const parsed = new URL(value, window.location.origin);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}
