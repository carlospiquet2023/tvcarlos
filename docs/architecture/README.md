# Decisões de arquitetura

Este diretório complementa `ARCHITECTURE.md`. O documento raiz descreve a visão atual; estes documentos registram políticas operacionais e decisões que precisam permanecer verificáveis.

## Índice

- `DATA_AND_TENANCY.md`: entidades, isolamento institucional e rollout de constraints;
- `TESTING_STRATEGY.md`: camadas de teste, responsabilidades e quality gates;
- `ADR-001-MODULAR-MONOLITH.md`: por que a plataforma permanece um monólito modular;
- `ADR-002-COURSE-OWNERSHIP.md`: decisão pendente sobre ownership do catálogo LMS.

## Regra de atualização

Toda mudança de boundary, processo, ownership de dados ou contrato público deve atualizar `ARCHITECTURE.md` e criar ou substituir um ADR. ADR aceito não é editado para reescrever a história; uma nova decisão o substitui explicitamente.
