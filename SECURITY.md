# Política de segurança

Não abra issue pública com vulnerabilidade explorável. Envie relato privado ao contato de segurança definido pela organização responsável pelo deploy, incluindo impacto, reprodução e versão. O responsável deve acusar recebimento em até 2 dias úteis, classificar em até 5 e informar plano de correção.

Versões suportadas são a release atual de produção e a anterior durante a janela de atualização. Segredos nunca entram no Git; use o cofre do ambiente. Dependências são revisadas semanalmente e patches críticos seguem mudança emergencial com teste e rollback.

Controles mínimos do deploy: TLS, WAF/rate limit, cookies seguros, MFA operacional, menor privilégio, backups cifrados, logs centralizados, alerta e pentest independente antes de dados reais.
