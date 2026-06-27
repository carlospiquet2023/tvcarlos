import { describe, expect, it } from 'vitest';
import { brandingSchema, headerLinkSchema, partnerSchema, programSchema } from '../../src/http/schemas.js';

describe('HTTP input schemas', () => {
  it('rejects script and insecure asset URLs', () => {
    expect(partnerSchema.safeParse({ name: 'Parceiro', logoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(partnerSchema.safeParse({ name: 'Parceiro', logoUrl: 'http://inseguro.test/logo.png' }).success).toBe(false);
    expect(partnerSchema.safeParse({ name: 'Parceiro', logoUrl: '/uploads/a.webp' }).success).toBe(true);
    expect(partnerSchema.safeParse({ name: 'Parceiro', logoUrl: '/uploads/a.webp', destinationUrl: 'https://parceiro.test' }).success).toBe(true);
    expect(partnerSchema.safeParse({ name: 'Parceiro', logoUrl: '/uploads/a.webp', destinationUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects traversal in video references and unknown fields', () => {
    expect(programSchema.safeParse({ title: 'Programa', description: '', video: '../secret.mp4' }).success).toBe(false);
    expect(programSchema.safeParse({ title: 'Programa', description: '', video: 'video.mp4', admin: true }).success).toBe(false);
  });

  it('accepts supported YouTube URLs and rejects malformed YouTube references', () => {
    const base = { title: 'Chamada', description: 'Conteúdo complementar' };
    expect(programSchema.safeParse({ ...base, video: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(true);
    expect(programSchema.safeParse({ ...base, video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).success).toBe(true);
    expect(programSchema.safeParse({ ...base, video: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' }).success).toBe(true);
    expect(programSchema.safeParse({ ...base, video: 'https://www.youtube.com/watch?v=invalido' }).success).toBe(false);
  });

  it('accepts a complete safe branding payload', () => {
    expect(brandingSchema.safeParse({
      companyName: 'Canal', watermarkText: 'Canal', logoText: 'Canal', logoUrl: '',
      tagline: 'Sinal independente', scheduleTitle: 'Próximos vídeos', tickerLabel: 'Giro', partnerLabel: 'Parceiro',
      liveTitle: 'Ao vivo', liveDescription: '', loopTitle: 'Programação', loopDescription: '',
      legalName: 'Carlos Antonio de Oliveira Piquet', legalEmail: 'carlos.piquet2016@gmail.com',
      legalCnpj: '27.658.099/0001-70', legalCity: 'Rio de Janeiro - RJ', legalPhone: '+55 21 97905-4104',
    }).success).toBe(true);
  });

  it('validates YouTube live source settings in branding', () => {
    const base = {
      companyName: 'Canal', watermarkText: 'Canal', logoText: 'Canal', logoUrl: '',
      tagline: 'Sinal independente', scheduleTitle: 'Próximos vídeos', tickerLabel: 'Giro', partnerLabel: 'Parceiro',
      liveTitle: 'Ao vivo', liveDescription: '', loopTitle: 'Programação', loopDescription: '',
      legalName: 'Carlos Antonio de Oliveira Piquet', legalEmail: 'carlos.piquet2016@gmail.com',
      legalCnpj: '27.658.099/0001-70', legalCity: 'Rio de Janeiro - RJ', legalPhone: '+55 21 97905-4104',
    };

    expect(brandingSchema.safeParse({ ...base, liveSource: 'obs', liveYoutubeUrl: '' }).success).toBe(true);
    expect(brandingSchema.safeParse({ ...base, liveSource: 'youtube', liveYoutubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(true);
    expect(brandingSchema.safeParse({ ...base, liveSource: 'youtube', liveYoutubeUrl: '' }).success).toBe(true);
    expect(brandingSchema.safeParse({ ...base, liveSource: 'youtube', liveYoutubeUrl: 'https://example.com/live' }).success).toBe(false);
  });

  it('accepts internal and HTTPS header links while rejecting unsafe schemes', () => {
    expect(headerLinkSchema.safeParse({ name: 'Notícias', url: 'noticias.html' }).success).toBe(true);
    expect(headerLinkSchema.safeParse({ name: 'Parceiro', url: 'https://example.com' }).success).toBe(true);
    expect(headerLinkSchema.safeParse({ name: 'Ataque', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(headerLinkSchema.safeParse({ name: 'Travessia', url: '../admin.html' }).success).toBe(false);
  });
});
