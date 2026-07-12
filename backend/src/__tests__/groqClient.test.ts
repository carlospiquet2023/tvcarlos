import { describe, expect, it, vi } from 'vitest';
import {
    AiProviderError,
    GroqClient,
    GROQ_DEFAULTS,
    resolveGroqConfig,
    sanitizeModelOutput,
} from '../services/ai/groqClient';

describe('GroqClient', () => {
    it('usa Llama 4 antes do corte e troca para o fallback no instante do desligamento', () => {
        const before = resolveGroqConfig({}, new Date('2026-07-16T23:59:59.999Z'));
        const after = resolveGroqConfig({}, new Date('2026-07-17T00:00:00.000Z'));

        expect(before.selectedModel).toBe(GROQ_DEFAULTS.primaryModel);
        expect(after.selectedModel).toBe(GROQ_DEFAULTS.fallbackModel);
    });

    it('respeita os nomes de ambiente usados pelo Docker', () => {
        const config = resolveGroqConfig({
            GROQ_MODEL: 'modelo-primario',
            GROQ_FALLBACK_MODEL: 'modelo-fallback',
            GROQ_MODEL_SWITCH_AT: '2027-01-01T00:00:00.000Z',
            GROQ_TIMEOUT_MS: '5000',
            GROQ_MAX_TOKENS: '777',
        }, new Date('2026-01-01T00:00:00.000Z'));

        expect(config).toMatchObject({
            primaryModel: 'modelo-primario',
            fallbackModel: 'modelo-fallback',
            selectedModel: 'modelo-primario',
            timeoutMs: 5000,
            maxTokens: 777,
        });
    });

    it('faz fallback apenas depois de erro de disponibilidade do modelo', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'model decommissioned' } }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                model: 'modelo-fallback',
                choices: [{ message: { content: 'Resposta segura' } }],
                usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const client = new GroqClient({
            GROQ_API_KEY: 'dummy-test-key',
            GROQ_MODEL: 'modelo-primario',
            GROQ_FALLBACK_MODEL: 'modelo-fallback',
            GROQ_MODEL_SWITCH_AT: '2027-01-01T00:00:00.000Z',
        }, fetchMock as unknown as typeof fetch, () => new Date('2026-01-01T00:00:00.000Z'));

        const result = await client.chat([{ role: 'user', content: 'Explique o tema.' }]);

        expect(result).toMatchObject({ content: 'Resposta segura', model: 'modelo-fallback', usedFallback: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
        expect(firstBody).toMatchObject({ model: 'modelo-primario', max_completion_tokens: 1200 });
        expect(secondBody.model).toBe('modelo-fallback');
        expect(firstBody).not.toHaveProperty('max_tokens');
    });

    it('falha de forma segura quando a credencial nao esta configurada', async () => {
        const client = new GroqClient({}, vi.fn() as unknown as typeof fetch);
        await expect(client.chat([{ role: 'user', content: 'Oi' }])).rejects.toMatchObject({
            code: 'AI_NOT_CONFIGURED',
            statusCode: 503,
        });
    });

    it('remove controles e limita a resposta recebida', () => {
        expect(sanitizeModelOutput('  resposta\u0000\u0007 valida  ')).toBe('resposta valida');
        expect(sanitizeModelOutput('x'.repeat(20_000))).toHaveLength(16_000);
    });
});
