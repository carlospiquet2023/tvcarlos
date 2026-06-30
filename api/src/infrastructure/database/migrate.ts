import { randomUUID } from 'node:crypto';
import type { Database } from './schema.js';

export async function migrate(database: Database): Promise<void> {
  await database.schema
    .createTable('app_migrations')
    .ifNotExists()
    .addColumn('version', 'integer', (column) => column.primaryKey())
    .addColumn('applied_at', 'timestamptz', (column) => column.notNull())
    .execute();

  const applied = await database.selectFrom('app_migrations').select('version').execute();
  const versions = new Set(applied.map((row) => row.version));

  if (!versions.has(1)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .createTable('users')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('username', 'varchar(80)', (column) => column.notNull())
        .addColumn('normalized_username', 'varchar(80)', (column) => column.notNull().unique())
        .addColumn('password_hash', 'varchar(512)', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('sessions')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('user_id', 'uuid', (column) =>
          column.notNull().references('users.id').onDelete('cascade'),
        )
        .addColumn('token_hash', 'varchar(64)', (column) => column.notNull().unique())
        .addColumn('csrf_hash', 'varchar(64)', (column) => column.notNull())
        .addColumn('expires_at', 'timestamptz', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();
      await transaction.schema.createIndex('sessions_expiry_idx').on('sessions').column('expires_at').execute();

      await transaction.schema
        .createTable('news')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('text', 'varchar(500)', (column) => column.notNull())
        .addColumn('position', 'integer', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('programs')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('title', 'varchar(160)', (column) => column.notNull())
        .addColumn('description', 'varchar(500)', (column) => column.notNull())
        .addColumn('video', 'varchar(2048)', (column) => column.notNull())
        .addColumn('position', 'integer', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('branding')
        .addColumn('id', 'varchar(20)', (column) => column.primaryKey())
        .addColumn('company_name', 'varchar(160)', (column) => column.notNull())
        .addColumn('watermark_text', 'varchar(300)', (column) => column.notNull())
        .addColumn('logo_text', 'varchar(160)', (column) => column.notNull())
        .addColumn('logo_url', 'varchar(2048)', (column) => column.notNull())
        .addColumn('live_title', 'varchar(160)', (column) => column.notNull())
        .addColumn('live_description', 'varchar(300)', (column) => column.notNull())
        .addColumn('loop_title', 'varchar(160)', (column) => column.notNull())
        .addColumn('loop_description', 'varchar(300)', (column) => column.notNull())
        .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('partners')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('name', 'varchar(160)', (column) => column.notNull())
        .addColumn('logo_url', 'varchar(2048)', (column) => column.notNull())
        .addColumn('position', 'integer', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('media_assets')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('kind', 'varchar(10)', (column) => column.notNull())
        .addColumn('storage_key', 'varchar(255)', (column) => column.notNull().unique())
        .addColumn('mime_type', 'varchar(100)', (column) => column.notNull())
        .addColumn('byte_size', 'bigint', (column) => column.notNull())
        .addColumn('sha256', 'varchar(64)', (column) => column.notNull())
        .addColumn('original_name', 'varchar(255)', (column) => column.notNull())
        .addColumn('created_by', 'uuid', (column) => column.notNull().references('users.id'))
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('audit_logs')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('actor_user_id', 'uuid')
        .addColumn('action', 'varchar(100)', (column) => column.notNull())
        .addColumn('target_type', 'varchar(100)', (column) => column.notNull())
        .addColumn('target_id', 'varchar(255)')
        .addColumn('request_id', 'varchar(100)')
        .addColumn('ip', 'varchar(100)')
        .addColumn('metadata', 'text', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();
      await transaction.schema.createIndex('audit_created_idx').on('audit_logs').column('created_at').execute();

      await transaction
        .insertInto('app_migrations')
        .values({ version: 1, applied_at: new Date() })
        .execute();
    });
  }

  if (!versions.has(2)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('branding')
        .addColumn('tagline', 'varchar(160)', (column) => column.notNull().defaultTo('SINAL INDEPENDENTE · BRASIL'))
        .addColumn('schedule_title', 'varchar(160)', (column) => column.notNull().defaultTo('Próximos vídeos'))
        .addColumn('ticker_label', 'varchar(80)', (column) => column.notNull().defaultTo('GIRO TVC'))
        .addColumn('partner_label', 'varchar(80)', (column) => column.notNull().defaultTo('PARCEIRO'))
        .execute();

      await transaction.schema
        .alterTable('partners')
        .addColumn('destination_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .execute();

      await transaction
        .insertInto('app_migrations')
        .values({ version: 2, applied_at: new Date() })
        .execute();
    });
  }

  if (!versions.has(3)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('branding')
        .addColumn('legal_name', 'varchar(180)', (column) => column.notNull().defaultTo('Carlos Antonio de Oliveira Piquet'))
        .addColumn('legal_email', 'varchar(254)', (column) => column.notNull().defaultTo('carlos.piquet2016@gmail.com'))
        .addColumn('legal_cnpj', 'varchar(18)', (column) => column.notNull().defaultTo('27.658.099/0001-70'))
        .addColumn('legal_city', 'varchar(120)', (column) => column.notNull().defaultTo('Rio de Janeiro - RJ'))
        .addColumn('legal_phone', 'varchar(30)', (column) => column.notNull().defaultTo('+55 21 97905-4104'))
        .execute();

      await transaction.schema
        .createTable('header_links')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('name', 'varchar(40)', (column) => column.notNull())
        .addColumn('url', 'varchar(2048)', (column) => column.notNull())
        .addColumn('position', 'integer', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.insertInto('header_links').values({
        id: randomUUID(),
        name: 'Notícias',
        url: 'noticias.html',
        position: 0,
        created_at: new Date(),
      }).execute();

      await transaction.insertInto('app_migrations').values({ version: 3, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(4)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('branding')
        .addColumn('live_source', 'varchar(20)', (column) => column.notNull().defaultTo('obs'))
        .addColumn('live_youtube_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 4, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(5)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('branding')
        .addColumn('background_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 5, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(6)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .createTable('private_rooms')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('room_code', 'varchar(24)', (column) => column.notNull().unique())
        .addColumn('title', 'varchar(160)', (column) => column.notNull())
        .addColumn('description', 'varchar(500)', (column) => column.notNull())
        .addColumn('source_type', 'varchar(20)', (column) => column.notNull())
        .addColumn('source_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .addColumn('access_password_hash', 'varchar(512)', (column) => column.notNull())
        .addColumn('is_active', 'boolean', (column) => column.notNull().defaultTo(true))
        .addColumn('expires_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
        .execute();
      await transaction.schema.createIndex('private_rooms_code_idx').on('private_rooms').column('room_code').execute();
      await transaction.schema.createIndex('private_rooms_active_idx').on('private_rooms').column('is_active').execute();

      await transaction.schema
        .createTable('private_room_access_sessions')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('room_id', 'uuid', (column) => column.notNull().references('private_rooms.id').onDelete('cascade'))
        .addColumn('token_hash', 'varchar(64)', (column) => column.notNull().unique())
        .addColumn('expires_at', 'timestamptz', (column) => column.notNull())
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .execute();
      await transaction.schema.createIndex('private_room_sessions_expiry_idx').on('private_room_access_sessions').column('expires_at').execute();

      await transaction.insertInto('app_migrations').values({ version: 6, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(7)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('branding')
        .addColumn('rss_news_url', 'varchar(2048)', (column) => column.notNull().defaultTo('https://api.rss2json.com/v1/api.json?rss_url=https://g1.globo.com/rss/g1/'))
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 7, applied_at: new Date() }).execute();
    });
  }
  if (!versions.has(8)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('programs')
        .addColumn('category', 'varchar(100)')
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 8, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(9)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .createTable('private_room_interaction_settings')
        .addColumn('room_id', 'uuid', (column) => column.primaryKey().references('private_rooms.id').onDelete('cascade'))
        .addColumn('enabled', 'boolean', (column) => column.notNull().defaultTo(true))
        .addColumn('mode', 'varchar(30)', (column) => column.notNull().defaultTo('questions_comments'))
        .addColumn('require_name', 'boolean', (column) => column.notNull().defaultTo(true))
        .addColumn('allow_anonymous', 'boolean', (column) => column.notNull().defaultTo(false))
        .addColumn('collect_contact', 'boolean', (column) => column.notNull().defaultTo(false))
        .addColumn('moderation_required', 'boolean', (column) => column.notNull().defaultTo(true))
        .addColumn('allow_public_replies', 'boolean', (column) => column.notNull().defaultTo(true))
        .addColumn('notice_text', 'varchar(300)', (column) => column.notNull().defaultTo('Envie suas perguntas e comentários para a moderação.'))
        .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createTable('private_room_interaction_messages')
        .addColumn('id', 'uuid', (column) => column.primaryKey())
        .addColumn('room_id', 'uuid', (column) => column.notNull().references('private_rooms.id').onDelete('cascade'))
        .addColumn('participant_name', 'varchar(120)', (column) => column.notNull().defaultTo(''))
        .addColumn('participant_contact', 'varchar(180)', (column) => column.notNull().defaultTo(''))
        .addColumn('body', 'varchar(1000)', (column) => column.notNull())
        .addColumn('admin_reply', 'varchar(1000)', (column) => column.notNull().defaultTo(''))
        .addColumn('status', 'varchar(20)', (column) => column.notNull().defaultTo('pending'))
        .addColumn('is_highlighted', 'boolean', (column) => column.notNull().defaultTo(false))
        .addColumn('ip_hash', 'varchar(64)')
        .addColumn('user_agent', 'varchar(255)', (column) => column.notNull().defaultTo(''))
        .addColumn('moderated_by', 'uuid', (column) => column.references('users.id').onDelete('set null'))
        .addColumn('moderated_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
        .execute();

      await transaction.schema
        .createIndex('private_room_messages_room_status_created_idx')
        .on('private_room_interaction_messages')
        .columns(['room_id', 'status', 'created_at'])
        .execute();
      await transaction.schema
        .createIndex('private_room_messages_highlight_idx')
        .on('private_room_interaction_messages')
        .columns(['room_id', 'is_highlighted'])
        .execute();
      await transaction.schema
        .createIndex('private_room_messages_antispam_idx')
        .on('private_room_interaction_messages')
        .columns(['room_id', 'ip_hash', 'created_at'])
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 9, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(10)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('private_rooms')
        .addColumn('support_material_enabled', 'boolean', (column) => column.notNull().defaultTo(false))
        .addColumn('support_material_title', 'varchar(160)', (column) => column.notNull().defaultTo('Material de apoio'))
        .addColumn('support_material_type', 'varchar(20)', (column) => column.notNull().defaultTo('url'))
        .addColumn('support_material_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 10, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(11)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('private_rooms')
        .addColumn('support_material_current_page', 'integer', (column) => column.notNull().defaultTo(1))
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 11, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(12)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('users')
        .addColumn('role', 'varchar(20)', (column) => column.notNull().defaultTo('admin'))
        .execute();

      await transaction.schema
        .createTable('teacher_private_room_access')
        .addColumn('user_id', 'uuid', (column) => column.notNull().references('users.id').onDelete('cascade'))
        .addColumn('room_id', 'uuid', (column) => column.notNull().references('private_rooms.id').onDelete('cascade'))
        .addColumn('created_at', 'timestamptz', (column) => column.notNull())
        .addPrimaryKeyConstraint('teacher_private_room_access_pk', ['user_id', 'room_id'])
        .execute();

      await transaction.schema
        .createIndex('teacher_private_room_access_room_idx')
        .on('teacher_private_room_access')
        .column('room_id')
        .execute();

      await transaction.insertInto('app_migrations').values({ version: 12, applied_at: new Date() }).execute();
    });
  }

  if (!versions.has(13)) {
    await database.transaction().execute(async (transaction) => {
      await transaction.schema
        .alterTable('private_rooms')
        .addColumn('libras_url', 'varchar(2048)', (column) => column.notNull().defaultTo(''))
        .execute();
      await transaction.insertInto('app_migrations').values({ version: 13, applied_at: new Date() }).execute();
    });
  }
}
