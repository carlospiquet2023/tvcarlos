# Estratégia de testes

## Objetivo

Testes devem reduzir risco de mudança, não apenas aumentar contagem. Cada comportamento crítico precisa ser verificado na camada mais baixa capaz de detectar sua falha, complementado por integração nas fronteiras.

## Matriz

| Camada | O que verifica | Infraestrutura |
|---|---|---|
| Unidade | cálculos, parsing, políticas e normalização | nenhuma |
| Serviço | orquestração, autorização e transação | doubles ou banco controlado |
| HTTP | middleware, cookies, CSRF, status e contrato | app em memória |
| Banco | migration, FK, unique, trigger e queries | PostgreSQL efêmero |
| Componente | renderização, interação e erro | DOM de teste |
| E2E | jornadas críticas completas | stack real isolada |
| Carga | SLO e saturação | ambiente semelhante à produção |

## Jornadas obrigatórias

1. login, troca de senha temporária, logout e revogação;
2. criação de instituição, campus, ano e turma;
3. bloqueio de acesso cruzado entre organizações e campus;
4. matrícula, chamada, avaliação, nota e fechamento de período;
5. upload, fila, processamento e reprodução HLS;
6. importação Excel com rollback em falha;
7. acesso de responsável apenas aos dependentes vinculados;
8. indisponibilidade de Groq, SMTP, banco e storage sem vazamento de dados.

## CI

Pull requests devem executar:

- Prisma format/validate e migration em banco vazio;
- backend typecheck e testes;
- frontend lint, testes e build;
- build das imagens de API/worker, frontend, broadcast e broadcast-loop;
- auditoria de dependências;
- CodeQL em workflow dedicado.

O scanner de segredos do provedor deve permanecer habilitado na configuração do repositório. Como essa configuração não é demonstrável apenas pelos arquivos versionados, ela deve ser verificada no checklist de promoção e não pode ser presumida a partir do CI.

Testes que exigem PostgreSQL devem usar banco descartável e nunca credenciais de ambiente compartilhado.

## Cobertura

Cobertura serve como sinal de lacuna, não meta isolada. Priorize branches de autorização, transações, falhas externas e validação. Código gerado, tipos e configuração declarativa podem ser excluídos com justificativa.
