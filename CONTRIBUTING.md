# Contribuição

Use branch curta, commit focado e pull request. Nenhuma mudança vai direto à branch protegida. Pelo menos uma revisão é obrigatória; autenticação, dados, infraestrutura e permissões exigem revisor do domínio.

Antes de abrir PR:

```bash
npm run install:all
npm run quality
```

Mudanças de banco exigem migração versionada, impacto, plano de roll-forward/rollback e teste em PostgreSQL. Mudanças de API atualizam contratos e documentação. Funcionalidades incluem estados vazio/loading/erro, acessibilidade, logs úteis, auditoria quando mutáveis e testes proporcionais ao risco.

Não use `any`, `@ts-ignore`, `@ts-nocheck`, segredo em código, log de credencial nem dependência nova sem justificativa e auditoria.
