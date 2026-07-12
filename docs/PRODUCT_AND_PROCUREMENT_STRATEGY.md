# Estratégia de produto para redes públicas e privadas

## Posicionamento

A plataforma deve ser vendida como ambiente educacional modular, auditável e white-label — não apenas hospedagem de vídeo. O diferencial sustentável é unir aprendizagem, operação escolar, inclusão, dados e IA governada com implantação compatível com a realidade de cada rede.

## Capacidades já presentes

- Cursos, módulos, aulas HLS, PDFs, editor de conteúdo e progresso.
- Matrícula individual/em lote, papéis, atribuição docente e presença auditável.
- Avaliações, certificados verificáveis, notificações, comentários e moderação.
- Aulas ao vivo, campus broadcast, salas privadas e PWA/offline básico.
- Tutor de IA contextual, perfil de aprendizagem, histórico e métricas.
- White-label, logs, health checks, backups/runbook e containers.

## Gargalos educacionais e resposta de produto

| Gargalo | Resposta recomendada | Prioridade |
|---|---|---:|
| Evasão e baixa participação | alertas explicáveis, régua de intervenção e registro de acompanhamento | P0 |
| Internet/dispositivo limitados | conteúdo leve, download controlado, retomada e modo offline validado | P0 |
| Inclusão | legendas, transcrição, audiodescrição, Libras, teclado e WCAG/eMAG | P0 |
| Gestão fragmentada | API/OpenAPI, importação robusta e conectores com SIS/ERP/SSO | P0 |
| Sobrecarga docente | banco de questões, rubricas, correção assistida e analytics acionável | P1 |
| Família sem visibilidade | portal do responsável com consentimento e comunicação segmentada | P1 |
| Conteúdo sem governança | autoria, revisão, publicação, versão, validade e trilha de aprovação | P1 |
| Formação continuada | trilhas por competência, evidência e certificação | P1 |
| Decisões sem dados | indicadores com definição, qualidade, corte por coorte e exportação | P1 |
| IA insegura | RAG em conteúdo aprovado, avaliação, guardrails e revisão humana | P1 |

## Itens contratuais que viram arquitetura

- **Uma instalação por cliente** é suportável hoje. SaaS multi-instituição exige entidade `Organization/Tenant`, isolamento em todas as queries, quotas, chaves e auditoria por tenant antes da primeira venda nesse modelo.
- SSO deve priorizar OpenID Connect/SAML e integração com Microsoft/Google; contas locais permanecem como contingência controlada.
- Integrações precisam de API versionada, idempotência, webhooks assinados e sandbox.
- Relatórios oficiais precisam de dicionário de dados, período de corte, autoria, exportação e reprodutibilidade.
- Customizações contratuais devem ser flags/configuração, nunca forks permanentes por cliente.

## Critério para adicionar funcionalidade

Uma feature entra quando possui problema validado, responsável, métrica de resultado, modelo de permissão, impacto LGPD, auditoria, acessibilidade, observabilidade, teste e custo operacional. Recursos sem esses elementos aumentam risco contratual e não maturidade.

## Pacotes comerciais sugeridos

- **Essencial:** cursos, matrícula, progresso, avaliações, certificados, suporte e SLO padrão.
- **Rede:** SSO, integrações, dashboards, gestão multiunidade quando o tenancy estiver concluído e suporte ampliado.
- **Inteligência:** tutor de IA governado, analytics de intervenção e curadoria, com limites e transparência de custo.
- **Campus:** transmissão ao vivo, programação, parceiros e comunicação institucional.

Nunca declarar conformidade, capacidade ou SLA sem anexar a evidência técnica correspondente ao ambiente do cliente.
