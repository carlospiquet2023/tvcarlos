import { randomUUID } from 'node:crypto';
import type { ContentRepository } from '../../application/ports.js';
import { DEFAULT_BRANDING, type Branding, type HeaderLink, type MediaAsset, type NewsItem, type Partner, type Program } from '../../domain/models.js';
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

  async listPrograms(): Promise<Program[]> {
    const rows = await this.database.selectFrom('programs').selectAll().orderBy('position').orderBy('created_at').execute();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      video: row.video,
      position: row.position,
      createdAt: row.created_at,
    }));
  }

  async createProgram(input: Pick<Program, 'title' | 'description' | 'video'>): Promise<Program> {
    const position = await this.nextPosition('programs');
    const row = await this.database
      .insertInto('programs')
      .values({ id: randomUUID(), ...input, position, created_at: new Date() })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { id: row.id, title: row.title, description: row.description, video: row.video, position: row.position, createdAt: row.created_at };
  }

  async updateProgram(id: string, input: Pick<Program, 'title' | 'description' | 'video'>): Promise<Program | undefined> {
    const row = await this.database.updateTable('programs').set(input).where('id', '=', id).returningAll().executeTakeFirst();
    return row ? { id: row.id, title: row.title, description: row.description, video: row.video, position: row.position, createdAt: row.created_at } : undefined;
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

  async getBranding(): Promise<Branding> {
    const row = await this.database.selectFrom('branding').selectAll().where('id', '=', 'default').executeTakeFirst();
    if (!row) return { ...DEFAULT_BRANDING, updatedAt: new Date(0) };
    return {
      companyName: row.company_name,
      tagline: row.tagline,
      watermarkText: row.watermark_text,
      logoText: row.logo_text,
      logoUrl: row.logo_url,
      scheduleTitle: row.schedule_title,
      tickerLabel: row.ticker_label,
      partnerLabel: row.partner_label,
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
      schedule_title: branding.scheduleTitle,
      ticker_label: branding.tickerLabel,
      partner_label: branding.partnerLabel,
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
}
