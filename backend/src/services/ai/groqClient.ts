const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_PRIMARY_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_FALLBACK_MODEL = 'openai/gpt-oss-120b';
// O modelo primario tem desligamento anunciado para 17/07/2026.
const DEFAULT_SWITCH_AT = '2026-07-17T00:00:00.000Z';

export type GroqMessageRole = 'system' | 'user' | 'assistant';

export interface GroqChatMessage {
    role: GroqMessageRole;
    content: string;
}

export interface GroqChatResult {
    content: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    usedFallback: boolean;
}

export interface GroqRuntimeConfig {
    configured: boolean;
    primaryModel: string;
    fallbackModel: string;
    selectedModel: string;
    switchAt: Date;
    timeoutMs: number;
    maxTokens: number;
}

type FetchImplementation = typeof fetch;

export class AiProviderError extends Error {
    constructor(
        public readonly code: 'AI_NOT_CONFIGURED' | 'AI_TIMEOUT' | 'AI_MODEL_UNAVAILABLE' | 'AI_PROVIDER_UNAVAILABLE' | 'AI_INVALID_RESPONSE',
        public readonly statusCode: number,
        public readonly retryable: boolean,
    ) {
        super(code);
        this.name = 'AiProviderError';
    }
}

export class GroqClient {
    constructor(
        private readonly environment: NodeJS.ProcessEnv = process.env,
        private readonly fetchImplementation: FetchImplementation = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}

    status(): GroqRuntimeConfig {
        return resolveGroqConfig(this.environment, this.now());
    }

    async chat(messages: GroqChatMessage[]): Promise<GroqChatResult> {
        const config = this.status();
        const apiKey = this.environment.GROQ_API_KEY?.trim();
        if (!apiKey) {
            throw new AiProviderError('AI_NOT_CONFIGURED', 503, false);
        }

        const candidates = config.selectedModel === config.fallbackModel
            ? [config.fallbackModel]
            : [config.primaryModel, config.fallbackModel].filter((model, index, models) => models.indexOf(model) === index);

        let lastModelError = false;
        for (const [index, model] of candidates.entries()) {
            try {
                const result = await this.requestModel(apiKey, model, messages, config);
                return { ...result, usedFallback: index > 0 || model === config.fallbackModel && model !== config.primaryModel };
            } catch (error) {
                if (error instanceof ModelAvailabilityError && index < candidates.length - 1) {
                    lastModelError = true;
                    continue;
                }
                if (error instanceof AiProviderError) throw error;
                if (error instanceof ModelAvailabilityError) {
                    throw new AiProviderError('AI_MODEL_UNAVAILABLE', 503, true);
                }
                throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', 503, true);
            }
        }

        throw new AiProviderError(lastModelError ? 'AI_MODEL_UNAVAILABLE' : 'AI_PROVIDER_UNAVAILABLE', 503, true);
    }

    private async requestModel(
        apiKey: string,
        model: string,
        messages: GroqChatMessage[],
        config: GroqRuntimeConfig,
    ): Promise<Omit<GroqChatResult, 'usedFallback'>> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
        const startedAt = Date.now();

        try {
            const response = await this.fetchImplementation(GROQ_CHAT_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.25,
                    max_completion_tokens: config.maxTokens,
                    stream: false,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const providerMessage = await readProviderError(response);
                if (isModelAvailabilityError(response.status, providerMessage)) {
                    throw new ModelAvailabilityError();
                }
                throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', 503, response.status === 429 || response.status >= 500);
            }

            const payload = await response.json() as {
                model?: unknown;
                choices?: Array<{ message?: { content?: unknown } }>;
                usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
            };
            const rawContent = payload.choices?.[0]?.message?.content;
            if (typeof rawContent !== 'string' || !rawContent.trim()) {
                throw new AiProviderError('AI_INVALID_RESPONSE', 503, true);
            }

            return {
                content: sanitizeModelOutput(rawContent),
                model: typeof payload.model === 'string' && payload.model.trim() ? payload.model : model,
                promptTokens: optionalNonNegativeInteger(payload.usage?.prompt_tokens),
                completionTokens: optionalNonNegativeInteger(payload.usage?.completion_tokens),
                totalTokens: optionalNonNegativeInteger(payload.usage?.total_tokens),
                latencyMs: Date.now() - startedAt,
            };
        } catch (error) {
            if (error instanceof AiProviderError || error instanceof ModelAvailabilityError) throw error;
            if (controller.signal.aborted || isAbortError(error)) {
                throw new AiProviderError('AI_TIMEOUT', 504, true);
            }
            throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', 503, true);
        } finally {
            clearTimeout(timeout);
        }
    }
}

class ModelAvailabilityError extends Error {}

export function resolveGroqConfig(environment: NodeJS.ProcessEnv = process.env, now = new Date()): GroqRuntimeConfig {
    const primaryModel = firstNonEmpty(environment.GROQ_MODEL, environment.GROQ_PRIMARY_MODEL) || DEFAULT_PRIMARY_MODEL;
    const fallbackModel = firstNonEmpty(environment.GROQ_FALLBACK_MODEL) || DEFAULT_FALLBACK_MODEL;
    const configuredSwitchAt = Date.parse(environment.GROQ_MODEL_SWITCH_AT || DEFAULT_SWITCH_AT);
    const switchAt = new Date(Number.isFinite(configuredSwitchAt) ? configuredSwitchAt : Date.parse(DEFAULT_SWITCH_AT));
    const selectedModel = now.getTime() >= switchAt.getTime() ? fallbackModel : primaryModel;

    return {
        configured: Boolean(environment.GROQ_API_KEY?.trim()),
        primaryModel,
        fallbackModel,
        selectedModel,
        switchAt,
        timeoutMs: boundedInteger(environment.GROQ_TIMEOUT_MS, 20_000, 1_000, 60_000),
        maxTokens: boundedInteger(environment.GROQ_MAX_TOKENS, 1_200, 128, 4_096),
    };
}

export function isModelAvailabilityError(status: number, providerMessage: string): boolean {
    if (![400, 404, 410, 422].includes(status)) return false;
    return /model|decommission|deprecat|not found|does not exist|unsupported/i.test(providerMessage);
}

export function sanitizeModelOutput(content: string): string {
    return content
        .replace(/\u0000/g, '')
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 16_000);
}

async function readProviderError(response: Response): Promise<string> {
    try {
        return (await response.text()).slice(0, 2_000);
    } catch {
        return '';
    }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
    return values.map((value) => value?.trim()).find(Boolean);
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export const GROQ_DEFAULTS = {
    primaryModel: DEFAULT_PRIMARY_MODEL,
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    switchAt: DEFAULT_SWITCH_AT,
} as const;
