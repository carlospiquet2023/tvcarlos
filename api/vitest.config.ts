import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
      include: [
        'src/application/auth-service.ts',
        'src/application/content-service.ts',
        'src/infrastructure/security/*.ts',
        'src/http/schemas.ts',
      ],
    },
  },
});
