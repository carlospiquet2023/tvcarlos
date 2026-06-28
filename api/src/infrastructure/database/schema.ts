import type { ColumnType, Kysely } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

export interface UsersTable {
  id: string;
  username: string;
  normalized_username: string;
  password_hash: string;
  role: 'admin' | 'teacher';
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TeacherPrivateRoomAccessTable {
  user_id: string;
  room_id: string;
  created_at: Timestamp;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
}

export interface NewsTable {
  id: string;
  text: string;
  position: number;
  created_at: Timestamp;
}

export interface ProgramsTable {
  id: string;
  title: string;
  description: string;
  video: string;
  category: string | null;
  position: number;
  created_at: Timestamp;
}

export interface PrivateRoomsTable {
  id: string;
  room_code: string;
  title: string;
  description: string;
  source_type: 'live' | 'youtube' | 'video' | 'external';
  source_url: string;
  support_material_enabled: boolean;
  support_material_title: string;
  support_material_type: 'url' | 'image' | 'pdf';
  support_material_url: string;
  support_material_current_page: number;
  access_password_hash: string;
  is_active: boolean;
  expires_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PrivateRoomAccessSessionsTable {
  id: string;
  room_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
}

export interface PrivateRoomInteractionSettingsTable {
  room_id: string;
  enabled: boolean;
  mode: 'questions_comments' | 'questions_only' | 'comments_only';
  require_name: boolean;
  allow_anonymous: boolean;
  collect_contact: boolean;
  moderation_required: boolean;
  allow_public_replies: boolean;
  notice_text: string;
  updated_at: Timestamp;
}

export interface PrivateRoomInteractionMessagesTable {
  id: string;
  room_id: string;
  participant_name: string;
  participant_contact: string;
  body: string;
  admin_reply: string;
  status: 'pending' | 'approved' | 'hidden' | 'answered' | 'archived';
  is_highlighted: boolean;
  ip_hash: string | null;
  user_agent: string;
  moderated_by: string | null;
  moderated_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface BrandingTable {
  id: string;
  company_name: string;
  tagline: string;
  watermark_text: string;
  logo_text: string;
  logo_url: string;
  background_url: string;
  schedule_title: string;
  ticker_label: string;
  rss_news_url: string;
  partner_label: string;
  live_source: 'obs' | 'youtube';
  live_youtube_url: string;
  live_title: string;
  live_description: string;
  loop_title: string;
  loop_description: string;
  legal_name: string;
  legal_email: string;
  legal_cnpj: string;
  legal_city: string;
  legal_phone: string;
  updated_at: Timestamp;
}

export interface HeaderLinksTable {
  id: string;
  name: string;
  url: string;
  position: number;
  created_at: Timestamp;
}

export interface PartnersTable {
  id: string;
  name: string;
  logo_url: string;
  destination_url: string;
  position: number;
  created_at: Timestamp;
}

export interface MediaAssetsTable {
  id: string;
  kind: 'image' | 'video' | 'document';
  storage_key: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  original_name: string;
  created_by: string;
  created_at: Timestamp;
}

export interface AuditLogsTable {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string | null;
  ip: string | null;
  metadata: string;
  created_at: Timestamp;
}

export interface AppMigrationsTable {
  version: number;
  applied_at: Timestamp;
}

export interface DatabaseSchema {
  users: UsersTable;
  teacher_private_room_access: TeacherPrivateRoomAccessTable;
  sessions: SessionsTable;
  news: NewsTable;
  programs: ProgramsTable;
  private_rooms: PrivateRoomsTable;
  private_room_access_sessions: PrivateRoomAccessSessionsTable;
  private_room_interaction_settings: PrivateRoomInteractionSettingsTable;
  private_room_interaction_messages: PrivateRoomInteractionMessagesTable;
  branding: BrandingTable;
  partners: PartnersTable;
  header_links: HeaderLinksTable;
  media_assets: MediaAssetsTable;
  audit_logs: AuditLogsTable;
  app_migrations: AppMigrationsTable;
}

export type Database = Kysely<DatabaseSchema>;
