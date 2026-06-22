import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config.js';

export function registerStreamRoutes(app: FastifyInstance, config: AppConfig) {
  app.post('/internal/rtmp/authorize', { config: { rateLimit: false } }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const rawStreamName = typeof body?.name === 'string' ? body.name : '';
    const [streamName = '', nameQuery = ''] = rawStreamName.split('?', 2);
    const argumentsValue = typeof body?.args === 'string' ? body.args : '';
    const directToken = typeof body?.token === 'string' ? body.token : '';
    const token = directToken
      || new URLSearchParams(argumentsValue).get('token')
      || new URLSearchParams(nameQuery).get('token')
      || '';
    const expected = streamName === 'stream'
      ? config.rtmpStreamKey
      : streamName === 'loop'
        ? config.loopStreamKey
        : '';

    if (!expected || !safeEqual(token, expected)) {
      request.log.warn({ streamName }, 'Rejected RTMP publisher');
      return reply.code(403).send();
    }
    return reply.code(204).send();
  });
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
