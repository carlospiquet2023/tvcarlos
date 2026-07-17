# Gates de prontidão para produção

“Produção” é um estado verificável, não uma aparência. Uma versão só pode ser promovida quando todos os itens aplicáveis possuem responsável, data e evidência.

## Evidência da release atual

A execução local controlada de 16/07/2026 está registrada em `docs/RELEASE_READINESS_2026-07-16.md`. Ela autoriza publicação e implantação em **staging**. Homologação no ambiente público, pentest independente e os demais controles organizacionais abaixo continuam sendo pré-requisitos para o go-live de produção.

## Gates automatizados

- `npm run quality` aprovado.
- Migrações aplicadas em banco vazio e ensaiadas em cópia anonimizada.
- CodeQL e auditoria de dependências sem vulnerabilidade alta/crítica aceita sem plano.
- Imagem Docker construída, assinada e escaneada.
- Testes de jornadas críticas e regressão aprovados.

## Gates de segurança e privacidade

- Pentest independente corrigido/retestado.
- RIPD/DPIA, bases legais, retenção e descarte aprovados pelo encarregado.
- Segredos em cofre; MFA para operação; menor privilégio; rotação testada.
- Backup cifrado fora do ambiente e restauração integral cronometrada.
- Logs sem credenciais/dados sensíveis e com retenção definida.
- Plano de incidente, contatos e simulado de mesa executado.

## Gates de experiência e educação

- Auditoria WCAG 2.2 AA e eMAG nas jornadas críticas.
- Teclado, leitor de tela, zoom 200%, contraste e redução de movimento validados.
- Responsividade em dispositivos e redes usados pelas escolas-piloto.
- Rubricas pedagógicas, critérios de conclusão e certificados aprovados.
- IA sinalizada como assistiva, com revisão humana e canal de contestação.

## Gates operacionais

- SLOs e alertas definidos; dashboards mostram disponibilidade, latência, erro, fila e storage.
- Teste de carga atende metas com 30% de margem.
- Rollback de aplicação e plano de migração/roll-forward ensaiados.
- Domínio, TLS, WAF/CDN, SMTP e entregabilidade homologados.
- Suporte, escalonamento, manutenção e comunicação de indisponibilidade definidos.

## Go/no-go

É `no-go` automático: vulnerabilidade crítica, restauração não comprovada, migração irreversível sem plano, perda de auditoria, jornada inacessível bloqueante, ausência de responsável pelo incidente ou métricas abaixo do SLO.
