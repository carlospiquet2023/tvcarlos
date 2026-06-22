import type {
  Branding,
  HeaderLink,
  AuditLog,
  MediaAsset,
  MediaKind,
  NewsItem,
  Partner,
  Program,
  Session,
  User,
} from '../domain/models.js';

export interface UserRepository {
  count(): Promise<number>;
  findByUsername(normalizedUsername: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'>): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateCredentialsAndRevokeSessions(
    userId: string,
    username: string,
    normalizedUsername: string,
    passwordHash: string,
  ): Promise<void>;
}

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findValidByTokenHash(tokenHash: string, now: Date): Promise<(Session & { user: User }) | undefined>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export interface ContentRepository {
  hasContent(): Promise<boolean>;
  listNews(): Promise<NewsItem[]>;
  createNews(text: string): Promise<NewsItem>;
  updateNews(id: string, text: string): Promise<NewsItem | undefined>;
  reorderNews(ids: string[]): Promise<void>;
  deleteNews(id: string): Promise<boolean>;
  listPrograms(): Promise<Program[]>;
  createProgram(input: Pick<Program, 'title' | 'description' | 'video'>): Promise<Program>;
  updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video'>): Promise<Program | undefined>;
  reorderPrograms(ids: string[]): Promise<void>;
  deleteProgram(id: string): Promise<boolean>;
  getBranding(): Promise<Branding>;
  updateBranding(branding: Omit<Branding, 'updatedAt'>): Promise<Branding>;
  listPartners(): Promise<Partner[]>;
  createPartner(input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>): Promise<Partner>;
  updatePartner(id: string, input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>): Promise<Partner | undefined>;
  reorderPartners(ids: string[]): Promise<void>;
  deletePartner(id: string): Promise<boolean>;
  listHeaderLinks(): Promise<HeaderLink[]>;
  createHeaderLink(input: Pick<HeaderLink, 'name' | 'url'>): Promise<HeaderLink>;
  updateHeaderLink(id: string, input: Pick<HeaderLink, 'name' | 'url'>): Promise<HeaderLink | undefined>;
  reorderHeaderLinks(ids: string[]): Promise<void>;
  deleteHeaderLink(id: string): Promise<boolean>;
  createMedia(asset: MediaAsset): Promise<void>;
}

export interface AuditRepository {
  list(limit: number): Promise<AuditLog[]>;
  append(input: {
    actorUserId?: string | undefined;
    action: string;
    targetType: string;
    targetId?: string | undefined;
    requestId?: string | undefined;
    ip?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<void>;
}

export interface StoredFile {
  key: string;
  publicUrl: string;
}

export interface MediaStorage {
  store(kind: MediaKind, sourcePath: string, extension: string): Promise<StoredFile>;
  remove(kind: MediaKind, key: string): Promise<void>;
}
