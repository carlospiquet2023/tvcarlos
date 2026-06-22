import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalNonEmpty = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  API_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  APP_ORIGIN: z.url().default('http://localhost:8082'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://tvcarlos:tvcarlos@localhost:5432/tvcarlos'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(15).max(1_440).default(120),
  COOKIE_SECURE: booleanFromString.default(false),
  ADMIN_INITIAL_USERNAME: z.string().trim().min(3).max(80).default('admin'),
  ADMIN_INITIAL_PASSWORD: optionalNonEmpty,
  IMAGE_STORAGE_DIR: z.string().min(1).default('/data/images'),
  VIDEO_STORAGE_DIR: z.string().min(1).default('/data/videos'),
  RTMP_STREAM_KEY: z.string().min(32).max(256),
  LOOP_STREAM_KEY: z.string().min(32).max(256),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const details = z.prettifyError(parsed.error);
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.API_PORT ?? parsed.data.PORT,
    appOrigin: parsed.data.APP_ORIGIN.replace(/\/$/, ''),
    databaseUrl: parsed.data.DATABASE_URL,
    sessionTtlMinutes: parsed.data.SESSION_TTL_MINUTES,
    cookieSecure: parsed.data.COOKIE_SECURE,
    initialAdminUsername: parsed.data.ADMIN_INITIAL_USERNAME,
    initialAdminPassword: parsed.data.ADMIN_INITIAL_PASSWORD,
    imageStorageDir: parsed.data.IMAGE_STORAGE_DIR,
    videoStorageDir: parsed.data.VIDEO_STORAGE_DIR,
    rtmpStreamKey: parsed.data.RTMP_STREAM_KEY,
    loopStreamKey: parsed.data.LOOP_STREAM_KEY,
    logLevel: parsed.data.LOG_LEVEL,
  } as const;
}
