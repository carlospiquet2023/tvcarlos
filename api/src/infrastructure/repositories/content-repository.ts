import { randomUUID } from 'node:crypto';
import type { ContentRepository } from '../../application/ports.js';
import {
  DEFAULT_BRANDING,
  type Branding,
  type HeaderLink,
  type MediaAsset,
  type NewsItem,
  type Partner,
  type PrivateRoom,
  type PrivateRoomAccessSession,
  type PrivateRoomInteractionSettings,
  type PrivateRoomMessage,
  type PrivateRoomMessageStatus,
  type Program,
} from '../../domain/models.js';
import type { Database } from '../database/schema.js';

export class PostgresContentRepository implements ContentRepository {
  constructor(private readonly database: Database) {}

  async hasContent(): Promise<boolean> {
    const row = await this.database.selectFrom('branding').select('id').limit(1).executeTakeFirst();
    return Boolean(row);
  }

  async listNews(): Promise<NewsItem[]> {
    const rows = await this.database.selectFrom('news').selectAll().orderBy('position').orderBy('created_at').execute();
    return rows.map((row) => ({ id: row.id, text: row.text, position: row.position, createdAt: row.created_at }));
  }

  async createNews(text: string): Promise<NewsItem> {
    const position = await this.nextPosition('news');
    const row = await this.database
      .insertInto('news')
      .values({ id: randomUUID(), text, position, created_at: new Date() })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { id: row.id, text: row.text, position: row.position, createdAt: row.created_at };
  }

  async updateNews(id: string, text: string): Promise<NewsItem | undefined> {
    const row = await this.database.updateTable('news').set({ text }).where('id', '=', id).returningAll().executeTakeFirst();
    return row ? { id: row.id, text: row.text, position: row.position, createdAt: row.created_at } : undefined;
  }

  async reorderNews(ids: string[]): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      for (const [position, id] of ids.entries()) {
        await transaction.updateTable('news').set({ position }).where('id', '=', id).execute();
      }
    });
  }

  async deleteNews(id: string): Promise<boolean> {
    const result = await this.database.deleteFrom('news').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async listPrograms(params?: { search?: string | undefined; category?: string | undefined; page?: number | undefined; limit?: number | undefined }): Promise<{ items: Program[]; total: number }> {
    let query = this.database.selectFrom('programs');
    if (params?.search) {
      const searchPattern = `%${params.search}%`;
      query = query.where((eb) => eb.or([
        eb('title', 'ilike', searchPattern),
        eb('description', 'ilike', searchPattern)
      ]));
    }
    if (params?.category) {
      query = query.where('category', '=', params.category);
    }

    const { count } = await query.select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirstOrThrow();
    
    let selectQuery = query.selectAll().orderBy('position').orderBy('created_at');
    if (params?.limit) {
      selectQuery = selectQuery.limit(params.limit);
      if (params.page) {
        selectQuery = selectQuery.offset((params.page - 1) * params.limit);
      }
    }

    const rows = await selectQuery.execute();
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        video: row.video,
        category: row.category,
        position: row.position,
        createdAt: row.created_at,
      })),
      total: Number(count),
    };
  }

  async listProgramCategories(): Promise<string[]> {
    const rows = await this.database
      .selectFrom('programs')
      .select('category')
      .where('category', 'is not', null)
      .where('category', '!=', '')
      .distinct()
      .orderBy('category')
      .execute();
    return rows.map((r) => r.category as string);
  }

  async createProgram(input: Pick<Program, 'title' | 'description' | 'video' | 'category'>): Promise<Program> {
    const position = await this.nextPosition('programs');
    const row = await this.database
      .insertInto('programs')
      .values({ id: randomUUID(), ...input, position, created_at: new Date() })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { id: row.id, title: row.title, description: row.description, video: row.video, category: row.category, position: row.position, createdAt: row.created_at };
  }

  async updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video' | 'category'>): Promise<Program | undefined> {
    const row = await this.database.updateTable('programs').set(input).where('id', '=', id).returningAll().executeTakeFirst();
    return row ? { id: row.id, title: row.title, description: row.description, video: row.video, category: row.category, position: row.position, createdAt: row.created_at } : undefined;
  }

  async reorderPrograms(ids: string[]): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      for (const [position, id] of ids.entries()) {
        await transaction.updateTable('programs').set({ position }).where('id', '=', id).execute();
      }
    });
  }

  async deleteProgram(id: string): Promise<boolean> {
    const result = await this.database.deleteFrom('programs').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async listPrivateRooms(): Promise<PrivateRoom[]> {
    const rows = await this.database.selectFrom('private_rooms').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map((row) => this.privateRoomFromRow(row));
  }

  async listPrivateRoomsForTeacher(userId: string): Promise<PrivateRoom[]> {
    const rows = await this.database
      .selectFrom('teacher_private_room_access')
      .innerJoin('private_rooms', 'private_rooms.id', 'teacher_private_room_access.room_id')
      .selectAll('private_rooms')
      .where('teacher_private_room_access.user_id', '=', userId)
      .orderBy('private_rooms.created_at', 'desc')
      .execute();
    return rows.map((row) => this.privateRoomFromRow(row));
  }

  async userCanAccessPrivateRoom(userId: string, roomId: string): Promise<boolean> {
    const row = await this.database
      .selectFrom('teacher_private_room_access')
      .select('room_id')
      .where('user_id', '=', userId)
      .where('room_id', '=', roomId)
      .executeTakeFirst();
    return Boolean(row);
  }

  async findPrivateRoomById(id: string): Promise<PrivateRoom | undefined> {
    const row = await this.database.selectFrom('private_rooms').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? this.privateRoomFromRow(row) : undefined;
  }

  async findPrivateRoomByCode(roomCode: string): Promise<(PrivateRoom & { accessPasswordHash: string }) | undefined> {
    const row = await this.database.selectFrom('private_rooms').selectAll().where('room_code', '=', roomCode).executeTakeFirst();
    return row ? { ...this.privateRoomFromRow(row), accessPasswordHash: row.access_password_hash } : undefined;
  }

  async createPrivateRoom(input: {
    roomCode: string;
    title: string;
    description: string;
    sourceType: PrivateRoom['sourceType'];
    sourceUrl: string;
    supportMaterialEnabled: boolean;
    supportMaterialTitle: string;
    supportMaterialType: PrivateRoom['supportMaterialType'];
    supportMaterialUrl: string;
    supportMaterialCurrentPage: number;
    accessPasswordHash: string;
    isActive: boolean;
    expiresAt?: Date | null;
    librasUrl: string;
  }): Promise<PrivateRoom> {
    const now = new Date();
    const row = await this.database
      .insertInto('private_rooms')
      .values({
        id: randomUUID(),
        room_code: input.roomCode,
        title: input.title,
        description: input.description,
        source_type: input.sourceType,
        source_url: input.sourceUrl,
        support_material_enabled: input.supportMaterialEnabled,
        support_material_title: input.supportMaterialTitle,
        support_material_type: input.supportMaterialType,
        support_material_url: input.supportMaterialUrl,
        support_material_current_page: input.supportMaterialCurrentPage,
        access_password_hash: input.accessPasswordHash,
        is_active: input.isActive,
        expires_at: input.expiresAt ?? null,
        created_at: now,
        updated_at: now,
        libras_url: input.librasUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.privateRoomFromRow(row);
  }

  async updatePrivateRoom(id: string, input: {
    title: string;
    description: string;
    sourceType: PrivateRoom['sourceType'];
    sourceUrl: string;
    supportMaterialEnabled: boolean;
    supportMaterialTitle: string;
    supportMaterialType: PrivateRoom['supportMaterialType'];
    supportMaterialUrl: string;
    supportMaterialCurrentPage: number;
    isActive: boolean;
    expiresAt?: Date | null;
    librasUrl: string;
  }): Promise<PrivateRoom | undefined> {
    const row = await this.database
      .updateTable('private_rooms')
      .set({
        title: input.title,
        description: input.description,
        source_type: input.sourceType,
        source_url: input.sourceUrl,
        support_material_enabled: input.supportMaterialEnabled,
        support_material_title: input.supportMaterialTitle,
        support_material_type: input.supportMaterialType,
        support_material_url: input.supportMaterialUrl,
        support_material_current_page: input.supportMaterialCurrentPage,
        is_active: input.isActive,
        expires_at: input.expiresAt ?? null,
        updated_at: new Date(),
        libras_url: input.librasUrl,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? this.privateRoomFromRow(row) : undefined;
  }

  async updatePrivateRoomPassword(id: string, accessPasswordHash: string): Promise<PrivateRoom | undefined> {
    const row = await this.database
      .updateTable('private_rooms')
      .set({ access_password_hash: accessPasswordHash, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? this.privateRoomFromRow(row) : undefined;
  }

  async deletePrivateRoom(id: string): Promise<boolean> {
    const result = await this.database.deleteFrom('private_rooms').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async createPrivateRoomAccessSession(session: PrivateRoomAccessSession): Promise<void> {
    await this.deleteExpiredPrivateRoomAccessSessions(new Date());
    await this.database
      .insertInto('private_room_access_sessions')
      .values({
        id: session.id,
        room_id: session.roomId,
        token_hash: session.tokenHash,
        expires_at: session.expiresAt,
        created_at: session.createdAt,
      })
      .executeTakeFirstOrThrow();
  }

  async findPrivateRoomByAccessToken(tokenHash: string, roomCode: string, now: Date): Promise<PrivateRoom | undefined> {
    const row = await this.database
      .selectFrom('private_room_access_sessions')
      .innerJoin('private_rooms', 'private_rooms.id', 'private_room_access_sessions.room_id')
      .selectAll('private_rooms')
      .where('private_room_access_sessions.token_hash', '=', tokenHash)
      .where('private_room_access_sessions.expires_at', '>', now)
      .where('private_rooms.room_code', '=', roomCode)
      .executeTakeFirst();
    return row ? this.privateRoomFromRow(row) : undefined;
  }

  async deleteExpiredPrivateRoomAccessSessions(now: Date): Promise<void> {
    await this.database.deleteFrom('private_room_access_sessions').where('expires_at', '<=', now).execute();
  }

  async getPrivateRoomInteractionSettings(roomId: string): Promise<PrivateRoomInteractionSettings | undefined> {
    const row = await this.database
      .selectFrom('private_room_interaction_settings')
      .selectAll()
      .where('room_id', '=', roomId)
      .executeTakeFirst();
    return row ? this.interactionSettingsFromRow(row) : undefined;
  }

  async updatePrivateRoomInteractionSettings(
    roomId: string,
    input: Omit<PrivateRoomInteractionSettings, 'roomId' | 'updatedAt'>,
  ): Promise<PrivateRoomInteractionSettings> {
    const now = new Date();
    const values = {
      room_id: roomId,
      enabled: input.enabled,
      mode: input.mode,
      require_name: input.requireName,
      allow_anonymous: input.allowAnonymous,
      collect_contact: input.collectContact,
      moderation_required: input.moderationRequired,
      allow_public_replies: input.allowPublicReplies,
      notice_text: input.noticeText,
      updated_at: now,
    };
    const row = await this.database
      .insertInto('private_room_interaction_settings')
      .values(values)
      .onConflict((conflict) => conflict.column('room_id').doUpdateSet({
        enabled: input.enabled,
        mode: input.mode,
        require_name: input.requireName,
        allow_anonymous: input.allowAnonymous,
        collect_contact: input.collectContact,
        moderation_required: input.moderationRequired,
        allow_public_replies: input.allowPublicReplies,
        notice_text: input.noticeText,
        updated_at: now,
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.interactionSettingsFromRow(row);
  }

  async listPrivateRoomMessages(
    roomId: string,
    options: { includeArchived?: boolean; publicOnly?: boolean } = {},
  ): Promise<PrivateRoomMessage[]> {
    const rows = await this.database
      .selectFrom('private_room_interaction_messages')
      .selectAll()
      .where('room_id', '=', roomId)
      .$if(!options.includeArchived, (query) => query.where('status', '!=', 'archived'))
      .$if(Boolean(options.publicOnly), (query) => query.where((expression) => expression.or([
        expression('status', '=', 'approved'),
        expression('status', '=', 'answered'),
      ])))
      .orderBy('is_highlighted', 'desc')
      .orderBy('created_at', 'desc')
      .limit(options.publicOnly ? 80 : 500)
      .execute();
    return rows.map((row) => this.privateRoomMessageFromRow(row));
  }

  async findPrivateRoomMessage(id: string): Promise<PrivateRoomMessage | undefined> {
    const row = await this.database
      .selectFrom('private_room_interaction_messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? this.privateRoomMessageFromRow(row) : undefined;
  }

  async createPrivateRoomMessage(input: Pick<PrivateRoomMessage, 'roomId' | 'participantName' | 'participantContact' | 'body' | 'status' | 'ipHash' | 'userAgent'>): Promise<PrivateRoomMessage> {
    const now = new Date();
    const row = await this.database
      .insertInto('private_room_interaction_messages')
      .values({
        id: randomUUID(),
        room_id: input.roomId,
        participant_name: input.participantName,
        participant_contact: input.participantContact,
        body: input.body,
        admin_reply: '',
        status: input.status,
        is_highlighted: false,
        ip_hash: input.ipHash ?? null,
        user_agent: input.userAgent,
        moderated_by: null,
        moderated_at: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.privateRoomMessageFromRow(row);
  }

  async updatePrivateRoomMessage(
    id: string,
    input: {
      status?: PrivateRoomMessageStatus | undefined;
      adminReply?: string | undefined;
      isHighlighted?: boolean | undefined;
      moderatedBy?: string | null | undefined;
      moderatedAt?: Date | null | undefined;
    },
  ): Promise<PrivateRoomMessage | undefined> {
    const changes: {
      status?: PrivateRoomMessageStatus;
      admin_reply?: string;
      is_highlighted?: boolean;
      moderated_by?: string | null;
      moderated_at?: Date | null;
      updated_at: Date;
    } = { updated_at: new Date() };
    if (input.status !== undefined) changes.status = input.status;
    if (input.adminReply !== undefined) changes.admin_reply = input.adminReply;
    if (input.isHighlighted !== undefined) changes.is_highlighted = input.isHighlighted;
    if (input.moderatedBy !== undefined) changes.moderated_by = input.moderatedBy;
    if (input.moderatedAt !== undefined) changes.moderated_at = input.moderatedAt;

    if (input.isHighlighted === true) {
      return this.database.transaction().execute(async (transaction) => {
        const existing = await transaction
          .selectFrom('private_room_interaction_messages')
          .select(['id', 'room_id'])
          .where('id', '=', id)
          .executeTakeFirst();
        if (!existing) return undefined;
        await transaction
          .updateTable('private_room_interaction_messages')
          .set({ is_highlighted: false })
          .where('room_id', '=', existing.room_id)
          .where('id', '!=', id)
          .execute();
        const row = await transaction
          .updateTable('private_room_interaction_messages')
          .set(changes)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirst();
        return row ? this.privateRoomMessageFromRow(row) : undefined;
      });
    }

    const row = await this.database
      .updateTable('private_room_interaction_messages')
      .set(changes)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? this.privateRoomMessageFromRow(row) : undefined;
  }

  async archivePrivateRoomMessages(roomId: string): Promise<void> {
    await this.database
      .updateTable('private_room_interaction_messages')
      .set({ status: 'archived', is_highlighted: false, updated_at: new Date() })
      .where('room_id', '=', roomId)
      .where('status', '!=', 'archived')
      .execute();
  }

  async countRecentPrivateRoomMessages(roomId: string, ipHash: string, since: Date): Promise<number> {
    const row = await this.database
      .selectFrom('private_room_interaction_messages')
      .select((expression) => expression.fn.count<number>('id').as('count'))
      .where('room_id', '=', roomId)
      .where('ip_hash', '=', ipHash)
      .where('created_at', '>=', since)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async hasRecentDuplicatePrivateRoomMessage(roomId: string, ipHash: string, body: string, since: Date): Promise<boolean> {
    const row = await this.database
      .selectFrom('private_room_interaction_messages')
      .select('id')
      .where('room_id', '=', roomId)
      .where('ip_hash', '=', ipHash)
      .where('body', '=', body)
      .where('created_at', '>=', since)
      .where('status', '!=', 'archived')
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  }

  async getBranding(): Promise<Branding> {
    const row = await this.database.selectFrom('branding').selectAll().where('id', '=', 'default').executeTakeFirst();
    if (!row) return { ...DEFAULT_BRANDING, updatedAt: new Date(0) };
    return {
      companyName: row.company_name,
      tagline: row.tagline,
      watermarkText: row.watermark_text,
      logoText: row.logo_text,
      logoUrl: row.logo_url,
      backgroundUrl: row.background_url,
      scheduleTitle: row.schedule_title,
      tickerLabel: row.ticker_label,
      rssNewsUrl: row.rss_news_url,
      partnerLabel: row.partner_label,
      liveSource: row.live_source,
      liveYoutubeUrl: row.live_youtube_url,
      liveTitle: row.live_title,
      liveDescription: row.live_description,
      loopTitle: row.loop_title,
      loopDescription: row.loop_description,
      legalName: row.legal_name,
      legalEmail: row.legal_email,
      legalCnpj: row.legal_cnpj,
      legalCity: row.legal_city,
      legalPhone: row.legal_phone,
      updatedAt: row.updated_at,
    };
  }

  async updateBranding(branding: Omit<Branding, 'updatedAt'>): Promise<Branding> {
    const now = new Date();
    const values = {
      company_name: branding.companyName,
      tagline: branding.tagline,
      watermark_text: branding.watermarkText,
      logo_text: branding.logoText,
      logo_url: branding.logoUrl,
      background_url: branding.backgroundUrl,
      schedule_title: branding.scheduleTitle,
      ticker_label: branding.tickerLabel,
      rss_news_url: branding.rssNewsUrl,
      partner_label: branding.partnerLabel,
      live_source: branding.liveSource,
      live_youtube_url: branding.liveYoutubeUrl,
      live_title: branding.liveTitle,
      live_description: branding.liveDescription,
      loop_title: branding.loopTitle,
      loop_description: branding.loopDescription,
      legal_name: branding.legalName,
      legal_email: branding.legalEmail,
      legal_cnpj: branding.legalCnpj,
      legal_city: branding.legalCity,
      legal_phone: branding.legalPhone,
      updated_at: now,
    };
    await this.database
      .insertInto('branding')
      .values({ id: 'default', ...values })
      .onConflict((conflict) => conflict.column('id').doUpdateSet(values))
      .execute();
    return { ...branding, updatedAt: now };
  }

  async listPartners(): Promise<Partner[]> {
    const rows = await this.database.selectFrom('partners').selectAll().orderBy('position').orderBy('created_at').execute();
    return rows.map((row) => ({ id: row.id, name: row.name, logoUrl: row.logo_url, destinationUrl: row.destination_url, position: row.position, createdAt: row.created_at }));
  }

  async createPartner(input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>): Promise<Partner> {
    const position = await this.nextPosition('partners');
    const row = await this.database
      .insertInto('partners')
      .values({ id: randomUUID(), name: input.name, logo_url: input.logoUrl, destination_url: input.destinationUrl, position, created_at: new Date() })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { id: row.id, name: row.name, logoUrl: row.logo_url, destinationUrl: row.destination_url, position: row.position, createdAt: row.created_at };
  }

  async updatePartner(id: string, input: Pick<Partner, 'name' | 'logoUrl' | 'destinationUrl'>): Promise<Partner | undefined> {
    const row = await this.database
      .updateTable('partners')
      .set({ name: input.name, logo_url: input.logoUrl, destination_url: input.destinationUrl })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? { id: row.id, name: row.name, logoUrl: row.logo_url, destinationUrl: row.destination_url, position: row.position, createdAt: row.created_at } : undefined;
  }

  async reorderPartners(ids: string[]): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      for (const [position, id] of ids.entries()) {
        await transaction.updateTable('partners').set({ position }).where('id', '=', id).execute();
      }
    });
  }

  async deletePartner(id: string): Promise<boolean> {
    const result = await this.database.deleteFrom('partners').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async listHeaderLinks(): Promise<HeaderLink[]> {
    const rows = await this.database.selectFrom('header_links').selectAll().orderBy('position').orderBy('created_at').execute();
    return rows.map((row) => ({ id: row.id, name: row.name, url: row.url, position: row.position, createdAt: row.created_at }));
  }

  async createHeaderLink(input: Pick<HeaderLink, 'name' | 'url'>): Promise<HeaderLink> {
    const position = await this.nextPosition('header_links');
    const row = await this.database.insertInto('header_links').values({
      id: randomUUID(), name: input.name, url: input.url, position, created_at: new Date(),
    }).returningAll().executeTakeFirstOrThrow();
    return { id: row.id, name: row.name, url: row.url, position: row.position, createdAt: row.created_at };
  }

  async updateHeaderLink(id: string, input: Pick<HeaderLink, 'name' | 'url'>): Promise<HeaderLink | undefined> {
    const row = await this.database.updateTable('header_links').set(input).where('id', '=', id).returningAll().executeTakeFirst();
    return row ? { id: row.id, name: row.name, url: row.url, position: row.position, createdAt: row.created_at } : undefined;
  }

  async reorderHeaderLinks(ids: string[]): Promise<void> {
    await this.database.transaction().execute(async (transaction) => {
      for (const [position, id] of ids.entries()) {
        await transaction.updateTable('header_links').set({ position }).where('id', '=', id).execute();
      }
    });
  }

  async deleteHeaderLink(id: string): Promise<boolean> {
    const result = await this.database.deleteFrom('header_links').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async createMedia(asset: MediaAsset): Promise<void> {
    await this.database
      .insertInto('media_assets')
      .values({
        id: asset.id,
        kind: asset.kind,
        storage_key: asset.storageKey,
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        sha256: asset.sha256,
        original_name: asset.originalName,
        created_by: asset.createdBy,
        created_at: asset.createdAt,
      })
      .executeTakeFirstOrThrow();
  }

  private async nextPosition(table: 'news' | 'programs' | 'partners' | 'header_links'): Promise<number> {
    const result = await this.database
      .selectFrom(table)
      .select((expression) => expression.fn.max<number>('position').as('position'))
      .executeTakeFirst();
    return Number(result?.position ?? -1) + 1;
  }

  private privateRoomFromRow(row: {
    id: string;
    room_code: string;
    title: string;
    description: string;
    source_type: PrivateRoom['sourceType'];
    source_url: string;
    support_material_enabled: boolean;
    support_material_title: string;
    support_material_type: PrivateRoom['supportMaterialType'];
    support_material_url: string;
    support_material_current_page: number;
    is_active: boolean;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
    libras_url: string;
  }): PrivateRoom {
    return {
      id: row.id,
      roomCode: row.room_code,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      supportMaterialEnabled: row.support_material_enabled,
      supportMaterialTitle: row.support_material_title,
      supportMaterialType: row.support_material_type,
      supportMaterialUrl: row.support_material_url,
      supportMaterialCurrentPage: row.support_material_current_page,
      isActive: row.is_active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      librasUrl: row.libras_url,
    };
  }

  private interactionSettingsFromRow(row: {
    room_id: string;
    enabled: boolean;
    mode: PrivateRoomInteractionSettings['mode'];
    require_name: boolean;
    allow_anonymous: boolean;
    collect_contact: boolean;
    moderation_required: boolean;
    allow_public_replies: boolean;
    notice_text: string;
    updated_at: Date;
  }): PrivateRoomInteractionSettings {
    return {
      roomId: row.room_id,
      enabled: row.enabled,
      mode: row.mode,
      requireName: row.require_name,
      allowAnonymous: row.allow_anonymous,
      collectContact: row.collect_contact,
      moderationRequired: row.moderation_required,
      allowPublicReplies: row.allow_public_replies,
      noticeText: row.notice_text,
      updatedAt: row.updated_at,
    };
  }

  private privateRoomMessageFromRow(row: {
    id: string;
    room_id: string;
    participant_name: string;
    participant_contact: string;
    body: string;
    admin_reply: string;
    status: PrivateRoomMessageStatus;
    is_highlighted: boolean;
    ip_hash: string | null;
    user_agent: string;
    moderated_by: string | null;
    moderated_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): PrivateRoomMessage {
    return {
      id: row.id,
      roomId: row.room_id,
      participantName: row.participant_name,
      participantContact: row.participant_contact,
      body: row.body,
      adminReply: row.admin_reply,
      status: row.status,
      isHighlighted: row.is_highlighted,
      ipHash: row.ip_hash,
      userAgent: row.user_agent,
      moderatedBy: row.moderated_by,
      moderatedAt: row.moderated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
