# SLO e orçamento de erro

Metas iniciais, a validar no piloto:

| Indicador | Meta mensal |
|---|---:|
| Disponibilidade de login e conteúdo | 99,9% |
| Latência p95 de leitura da API | < 500 ms |
| Latência p95 de escrita de progresso | < 750 ms |
| Erros 5xx da API | < 0,5% |
| Jobs de vídeo concluídos | 99% em até 30 min, conforme tamanho contratado |
| RPO | <= 24 h |
| RTO | <= 4 h |

O orçamento de erro de 99,9% é ~43 minutos/mês. Ao consumir 50%, congelar mudanças arriscadas; em 100%, priorizar confiabilidade. Alertas devem usar burn rate, não apenas indisponibilidade instantânea.
