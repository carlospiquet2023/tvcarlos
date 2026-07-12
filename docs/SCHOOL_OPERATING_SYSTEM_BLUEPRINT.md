# Blueprint do Sistema Operacional Escolar

Pesquisa consolidada em 12/07/2026 a partir de Moodle, Canvas/Instructure, INEP/Educacenso, BNCC/MEC e padrões 1EdTech.

## Princípio de produto

A plataforma deve unir SIS + LMS + comunicação + dados, mas apresentar somente o necessário para cada perfil. A configuração segue uma sequência guiada: instituição → unidade → ano/períodos → currículo → turmas → pessoas → horários → diário e avaliação.

## Domínios

1. **Rede e unidades:** organização, campi/escolas, calendário, turnos, salas e parâmetros.
2. **Pessoas:** estudantes, responsáveis, profissionais, vínculos, consentimentos e contatos.
3. **Acadêmico:** anos, períodos, componentes, turmas, matrículas, ofertas e horários.
4. **Ensino:** cursos, conteúdo, atividades, competências BNCC, rubricas e recursos externos.
5. **Diário:** encontros, conteúdo ministrado, frequência, justificativas e reposição.
6. **Avaliação:** instrumentos, pesos, notas, recuperação, conselho e resultado final.
7. **Permanência:** sinais de risco, intervenções, responsáveis e acompanhamento.
8. **Comunicação:** calendário, avisos segmentados, mensagens, notificações e responsáveis.
9. **Credenciais:** certificados, histórico, microcredenciais e evidências.
10. **Interoperabilidade:** API versionada, OneRoster 1.2, EduAPI, LTI 1.3 e webhooks.
11. **Operação:** auditoria, LGPD, acessibilidade, observabilidade, backup e SLO.

## Padrões adotados

- IDs UUID imutáveis e códigos humanos separados.
- Toda entidade escolar pertence a uma organização; consultas nunca inferem tenant pelo cliente.
- Papéis vêm de membership organizacional, com bypass apenas para administrador global.
- Alterações acadêmicas críticas são transacionais e auditadas.
- Períodos fechados bloqueiam mutação ordinária; reabertura exige justificativa.
- Datas são armazenadas em UTC/`date`; exibição respeita timezone da organização.
- Integrações possuem versão, idempotência, escopo, assinatura e trilha.
- Campos de interoperabilidade são mapeados, não misturados ao modelo central.

## Sequência de entrega

### Núcleo operacional

Organizações, unidades, anos/períodos, disciplinas, turmas, matrículas, responsáveis, ofertas, horários, diário, avaliações e notas.

### Profundidade pedagógica

Competências BNCC, rubricas, recuperação, conselho, planos individuais, inclusão, intervenção e analytics explicável.

### Ecossistema

OneRoster/EduAPI, LTI, SSO, webhooks, credenciais verificáveis e conectores governamentais homologados.

Estado atual: exportação JSON versionada e auditada, alinhada ao modelo OneRoster 1.2 para roster. Certificação 1EdTech, EduAPI, LTI e conectores governamentais permanecem gates comerciais/homologatórios e não devem ser anunciados como certificados antes dos testes oficiais.

### Serviços ampliados

Biblioteca, transporte, alimentação, patrimônio, atendimento, financeiro e admissões entram como módulos opcionais, evitando sobrecarregar escolas que não os utilizam.

## Métricas de valor

- Tempo para configurar uma escola e publicar a primeira turma.
- Tempo docente semanal gasto em lançamento e retrabalho.
- Percentual de registros acadêmicos completos e consistentes.
- Frequência, entrega, aprendizagem e intervenções concluídas.
- Tempo de resposta à família e taxa de leitura.
- Incidentes de integração, privacidade e acessibilidade.

Nenhuma métrica de engajamento substitui aprendizagem, permanência, equidade ou bem-estar.

## Referências oficiais consultadas

- Moodle LMS — recursos: https://moodle.com/solutions/lms/features/
- Canvas/Instructure — LMS, gradebook, outcomes e analytics: https://www.instructure.com/canvas
- INEP — etapas da coleta do Censo Escolar: https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/censo-escolar/etapas-da-coleta
- MEC — Base Nacional Comum Curricular: https://basenacionalcomum.mec.gov.br/a-base
- 1EdTech — OneRoster 1.2: https://standards.1edtech.org/oneroster/specifications/standards/v1p2
- 1EdTech — LTI 1.3: https://www.1edtech.org/standards/lti/why-adopt-lti-1p3
- 1EdTech — Open Badges: https://www.1edtech.org/standards/open-badges
