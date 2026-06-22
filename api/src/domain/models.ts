export interface User {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  csrfHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface NewsItem {
  id: string;
  text: string;
  position: number;
  createdAt: Date;
}

export interface Program {
  id: string;
  title: string;
  description: string;
  video: string;
  position: number;
  createdAt: Date;
}

export interface Branding {
  companyName: string;
  tagline: string;
  watermarkText: string;
  logoText: string;
  logoUrl: string;
  scheduleTitle: string;
  tickerLabel: string;
  partnerLabel: string;
  liveTitle: string;
  liveDescription: string;
  loopTitle: string;
  loopDescription: string;
  legalName: string;
  legalEmail: string;
  legalCnpj: string;
  legalCity: string;
  legalPhone: string;
  updatedAt: Date;
}

export interface HeaderLink {
  id: string;
  name: string;
  url: string;
  position: number;
  createdAt: Date;
}

export interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  destinationUrl: string;
  position: number;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  requestId?: string;
  ip?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type MediaKind = 'image' | 'video';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  originalName: string;
  createdBy: string;
  createdAt: Date;
}

export const DEFAULT_BRANDING: Omit<Branding, 'updatedAt'> = {
  companyName: 'TV Carlos',
  tagline: 'SINAL INDEPENDENTE · BRASIL',
  watermarkText: 'TV CARLOS • CONTEÚDO EXCLUSIVO',
  logoText: 'TV CARLOS',
  logoUrl: '',
  scheduleTitle: 'Próximos vídeos',
  tickerLabel: 'GIRO TVC',
  partnerLabel: 'PARCEIRO',
  liveTitle: 'Transmissão Especial Ao Vivo',
  liveDescription: 'Transmissão em tempo real',
  loopTitle: 'Programação Linear 24h',
  loopDescription: 'TV Carlos - Transmissão Automática',
  legalName: 'Carlos Antonio de Oliveira Piquet',
  legalEmail: 'carlos.piquet2016@gmail.com',
  legalCnpj: '27.658.099/0001-70',
  legalCity: 'Rio de Janeiro - RJ',
  legalPhone: '+55 21 97905-4104',
};
