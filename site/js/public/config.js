export const STREAMS = Object.freeze({
    live: Object.freeze({
        url: '/hls/stream.m3u8',
        title: 'Transmissão Especial Ao Vivo',
        description: 'Transmissão em tempo real',
        badgeClass: 'badge-live',
        badgeText: 'AO VIVO',
    }),
    loop: Object.freeze({
        url: '/hls/loop.m3u8',
        title: 'Programação Linear 24h',
        description: 'TV Carlos - Transmissão Automática',
        badgeClass: 'badge-recorded',
        badgeText: 'PROGRAMAÇÃO',
    }),
});

export const DEFAULT_BRANDING = Object.freeze({
    companyName: 'TV Carlos',
    tagline: 'SINAL INDEPENDENTE · BRASIL',
    watermarkText: 'TV CARLOS • CONTEÚDO EXCLUSIVO',
    logoText: 'TV Carlos',
    logoUrl: '',
    backgroundUrl: '',
    scheduleTitle: 'Próximos vídeos',
    tickerLabel: 'GIRO TVC',
    partnerLabel: 'PARCEIRO',
    liveSource: 'obs',
    liveYoutubeUrl: '',
    liveTitle: STREAMS.live.title,
    liveDescription: STREAMS.live.description,
    loopTitle: STREAMS.loop.title,
    loopDescription: STREAMS.loop.description,
    legalName: 'Carlos Antonio de Oliveira Piquet',
});

export const INTERVALS = Object.freeze({
    liveProbe: 7_000,
    clock: 1_000,
    contentRefresh: 120_000,
});

export const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast?latitude=-15.78,-23.55,-22.91,-19.92,-12.97,-8.05,-30.03,-3.11,-25.43&longitude=-47.93,-46.64,-43.17,-43.94,-38.50,-34.88,-51.23,-60.02,-49.27&current_weather=true';

export const CAPITALS = Object.freeze([
    ['DF', 21, 'America/Sao_Paulo'], ['SP', 19, 'America/Sao_Paulo'],
    ['RJ', 22, 'America/Sao_Paulo'], ['MG', 20, 'America/Sao_Paulo'],
    ['BA', 24, 'America/Sao_Paulo'], ['PE', 25, 'America/Sao_Paulo'],
    ['RS', 15, 'America/Sao_Paulo'], ['AM', 28, 'America/Manaus'],
    ['PR', 17, 'America/Sao_Paulo'],
].map(([uf, temp, timeZone]) => Object.freeze({ uf, temp, timeZone })));
