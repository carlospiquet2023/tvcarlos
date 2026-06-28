import type {
  Branding,
  HeaderLink,
  AuditLog,
  MediaAsset,
  MediaKind,
  NewsItem,
  Partner,
  PrivateRoom,
  PrivateRoomAccessSession,
  PrivateRoomInteractionSettings,
  PrivateRoomMessage,
  PrivateRoomMessageStatus,
  PrivateRoomSourceType,
  Program,
  Session,
  TeacherAccount,
  User,
} from '../domain/models.js';

export interface UserRepository {
  count(): Promise<number>;
  listTeachers(): Promise<TeacherAccount[]>;
  findByUsername(normalizedUsername: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  create(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { role?: User['role'] | undefined }): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateCredentialsAndRevokeSessions(
    userId: string,
    username: string,
    normalizedUsername: string,
    passwordHash: string,
  ): Promise<void>;
  createTeacher(input: Pick<User, 'id' | 'username' | 'normalizedUsername' | 'passwordHash'> & { roomIds: string[] }): Promise<TeacherAccount>;
  updateTeacherRooms(userId: string, roomIds: string[]): Promise<TeacherAccount | undefined>;
  deleteTeacher(userId: string): Promise<boolean>;
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
  listPrograms(params?: { search?: string | undefined; category?: string | undefined; page?: number | undefined; limit?: number | undefined }): Promise<{ items: Program[]; total: number }>;
  listProgramCategories(): Promise<string[]>;
  createProgram(input: Pick<Program, 'title' | 'description' | 'video' | 'category'>): Promise<Program>;
  updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video' | 'category'>): Promise<Program | undefined>;
  reorderPrograms(ids: string[]): Promise<void>;
  deleteProgram(id: string): Promise<boolean>;
  listPrivateRooms(): Promise<PrivateRoom[]>;
  listPrivateRoomsForTeacher(userId: string): Promise<PrivateRoom[]>;
  userCanAccessPrivateRoom(userId: string, roomId: string): Promise<boolean>;
  findPrivateRoomById(id: string): Promise<PrivateRoom | undefined>;
  findPrivateRoomByCode(roomCode: string): Promise<(PrivateRoom & { accessPasswordHash: string }) | undefined>;
  createPrivateRoom(input: {
    roomCode: string;
    title: string;
    description: string;
    sourceType: PrivateRoomSourceType;
    sourceUrl: string;
    supportMaterialEnabled: boolean;
    supportMaterialTitle: string;
    supportMaterialType: PrivateRoom['supportMaterialType'];
    supportMaterialUrl: string;
    supportMaterialCurrentPage: number;
    accessPasswordHash: string;
    isActive: boolean;
    expiresAt?: Date | null;
  }): Promise<PrivateRoom>;
  updatePrivateRoom(id: string, input: {
    title: string;
    description: string;
    sourceType: PrivateRoomSourceType;
    sourceUrl: string;
    supportMaterialEnabled: boolean;
    supportMaterialTitle: string;
    supportMaterialType: PrivateRoom['supportMaterialType'];
    supportMaterialUrl: string;
    supportMaterialCurrentPage: number;
    isActive: boolean;
    expiresAt?: Date | null;
  }): Promise<PrivateRoom | undefined>;
  updatePrivateRoomPassword(id: string, accessPasswordHash: string): Promise<PrivateRoom | undefined>;
  deletePrivateRoom(id: string): Promise<boolean>;
  createPrivateRoomAccessSession(session: PrivateRoomAccessSession): Promise<void>;
  findPrivateRoomByAccessToken(tokenHash: string, roomCode: string, now: Date): Promise<PrivateRoom | undefined>;
  deleteExpiredPrivateRoomAccessSessions(now: Date): Promise<void>;
  getPrivateRoomInteractionSettings(roomId: string): Promise<PrivateRoomInteractionSettings | undefined>;
  updatePrivateRoomInteractionSettings(roomId: string, input: Omit<PrivateRoomInteractionSettings, 'roomId' | 'updatedAt'>): Promise<PrivateRoomInteractionSettings>;
  listPrivateRoomMessages(roomId: string, options?: { includeArchived?: boolean; publicOnly?: boolean }): Promise<PrivateRoomMessage[]>;
  findPrivateRoomMessage(id: string): Promise<PrivateRoomMessage | undefined>;
  createPrivateRoomMessage(input: Pick<PrivateRoomMessage, 'roomId' | 'participantName' | 'participantContact' | 'body' | 'status' | 'ipHash' | 'userAgent'>): Promise<PrivateRoomMessage>;
  updatePrivateRoomMessage(id: string, input: {
    status?: PrivateRoomMessageStatus | undefined;
    adminReply?: string | undefined;
    isHighlighted?: boolean | undefined;
    moderatedBy?: string | null | undefined;
    moderatedAt?: Date | null | undefined;
  }): Promise<PrivateRoomMessage | undefined>;
  archivePrivateRoomMessages(roomId: string): Promise<void>;
  countRecentPrivateRoomMessages(roomId: string, ipHash: string, since: Date): Promise<number>;
  hasRecentDuplicatePrivateRoomMessage(roomId: string, ipHash: string, body: string, since: Date): Promise<boolean>;
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

export type ServiceHealthStatus = 'ok' | 'warning' | 'error' | 'neutral';

export interface StorageHealth {
  provider: 'local' | 'r2';
  status: ServiceHealthStatus;
  detail: string;
  checkedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface MediaStorage {
  initialize(): Promise<void>;
  healthCheck(): Promise<StorageHealth>;
  store(kind: MediaKind, sourcePath: string, extension: string): Promise<StoredFile>;
  remove(kind: MediaKind, key: string): Promise<void>;
}
