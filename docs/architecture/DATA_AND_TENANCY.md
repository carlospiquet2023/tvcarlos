# Dados e isolamento multi-tenant escolar

## Objetivo e escopo

Este documento descreve o modelo canônico e as garantias de integridade do contexto escolar introduzidas pela migration `20260713140000_school_tenant_integrity`.

O tenant escolar é `SchoolOrganization`. Um identificador isolado de campus, ano, turma, matrícula, disciplina ou oferta nunca deve ser interpretado como autorização. O acesso deve combinar o recurso com sua organização e, quando aplicável, com o campus do vínculo do usuário.

## Modelo canônico

```text
SchoolOrganization
├── SchoolCampus
├── AcademicYear
│   └── AcademicTerm
├── SchoolSubject
├── SchoolMembership ── User
├── SchoolClass ── SchoolCampus + AcademicYear
│   ├── SchoolEnrollment ── User (student)
│   └── SubjectOffering ── SchoolSubject + User (teacher)
│       ├── TimetableEntry
│       ├── ClassSession ── AcademicTerm
│       │   └── ClassAttendanceRecord
│       └── Assessment ── AcademicTerm
│           └── AssessmentGrade
└── SchoolEvent ── SchoolCampus? + SchoolClass?
```

As entidades que carregam `organizationId` têm esse valor como fronteira de segurança, não apenas como informação para filtro. As relações obrigatórias abaixo usam a combinação `(id, organizationId)`:

| Origem | Referência canônica | Invariante |
|---|---|---|
| `SchoolClass` | `SchoolCampus` | campus e turma pertencem à mesma organização |
| `SchoolClass` | `AcademicYear` | ano e turma pertencem à mesma organização |
| `SchoolEnrollment` | `SchoolClass` | matrícula e turma pertencem à mesma organização |
| `SubjectOffering` | `SchoolClass` | oferta e turma pertencem à mesma organização |
| `SubjectOffering` | `SchoolSubject` | oferta e disciplina pertencem à mesma organização |

Índices únicos auxiliares em `(id, organizationId)` existem em `SchoolCampus`, `AcademicYear`, `SchoolSubject` e `SchoolClass`. Eles permitem as FKs compostas sem alterar os IDs públicos. O índice `SchoolEnrollment(organizationId, studentId, status)` atende consultas frequentes de vínculo ativo dentro de um tenant.

## Escopo de acesso

`SchoolMembership` define o papel de uma pessoa na organização:

- `campusId = null`: o vínculo tem escopo organizacional;
- `campusId != null`: o vínculo é restrito àquele campus;
- `active = false`: o vínculo não concede acesso;
- `User.role = ADMIN`: administrador global da plataforma, sem dependência de membership escolar.

As funções de acesso a turma e oferta verificam, nesta ordem:

1. existência do recurso;
2. membership ativo e papel permitido na organização;
3. compatibilidade com o campus restrito do membership;
4. para professores, atribuição à turma/oferta.

O banco também impede que um membership referencie campus de outra organização. Essa relação é opcional e possui `ON DELETE SET NULL`; por isso a verificação multi-tenant é feita por trigger, e não por FK composta.

## Invariantes no banco

### Chaves estrangeiras compostas

As cinco relações obrigatórias da tabela anterior são protegidas por FKs compostas. Elas impedem novos vínculos cruzados mesmo que uma chamada ignore a camada HTTP ou use Prisma diretamente.

### Triggers

`assert_school_optional_tenant_scope` protege:

- campus de `SchoolMembership` na mesma organização;
- campus de `SchoolEvent` na mesma organização;
- turma de `SchoolEvent` na mesma organização;
- quando evento possui campus e turma, o campus informado deve ser o campus da turma.

`assert_school_academic_year_scope` protege `ClassSession` e `Assessment`: o `AcademicTerm` informado deve pertencer ao mesmo `AcademicYear` da turma alcançada pela oferta.

Triggers são executadas antes de `INSERT` e das atualizações das colunas relevantes. Violações usam SQLSTATE `23514`.

### Restrições de domínio

| Tabela | Regra |
|---|---|
| `AcademicYear` | `startDate <= endDate` |
| `AcademicTerm` | `order > 0` e `startDate <= endDate` |
| `SchoolSubject` | `workloadMinutes >= 0` |
| `SchoolClass` | capacidade nula ou positiva |
| `SchoolEnrollment` | saída nula ou posterior/igual à entrada |
| `TimetableEntry` | dia entre 1 e 7; minutos válidos; início anterior ao fim; intervalo de datas válido |
| `ClassSession` | horários ambos nulos ou ambos válidos, com início anterior ao fim |
| `ClassAttendanceRecord` | minutos presentes entre 0 e 1440, quando informados |
| `Assessment` | nota máxima positiva e peso não negativo |
| `AssessmentGrade` | nota nula ou não negativa |
| `SchoolEvent` | término nulo ou posterior/igual ao início |

Essas regras complementam a validação HTTP. A API rejeita booleanos não booleanos, datas civis impossíveis, timestamps sem fuso horário e UUIDs fora do formato RFC; o banco permanece como última barreira para qualquer outro produtor de dados.

## Estratégia `NOT VALID`

As novas FKs compostas e constraints `CHECK` são criadas com `NOT VALID`.

No PostgreSQL, isso significa:

- novos inserts e updates já são validados após a migration;
- linhas legadas não são varridas durante o deploy;
- inconsistências antigas não derrubam a implantação;
- a constraint só fica integralmente validada depois de `VALIDATE CONSTRAINT`.

A migration emite um `WARNING` com a quantidade de associações multi-tenant legadas encontradas. O aviso é diagnóstico; ele não corrige nem remove dados.

Triggers não possuem estado equivalente a `NOT VALID`: passam a proteger novas escritas imediatamente, mas não examinam linhas antigas. Assim, memberships, eventos e relações período/ano existentes também devem ser auditados antes do encerramento do rollout.

## Rollout recomendado

### 1. Preparação

1. Gerar snapshot/backup restaurável do PostgreSQL.
2. Confirmar que migrations anteriores estão aplicadas e que não há outra alteração concorrente no schema escolar.
3. Executar o deploy da aplicação compatível com o schema composto.
4. Aplicar `prisma migrate deploy` e guardar os logs, incluindo o warning de legado.
5. Monitorar erros SQLSTATE `23514` e violações de FK. Eles indicam um produtor ainda tentando gravar dados inconsistentes.

Não executar `prisma migrate reset` em nenhum ambiente com dados reais.

### 2. Auditoria e reparo do legado

Levantar as linhas divergentes antes de validar as constraints:

```sql
SELECT 'class_campus' AS kind, class."id"
FROM "SchoolClass" class
JOIN "SchoolCampus" campus ON campus."id" = class."campusId"
WHERE campus."organizationId" <> class."organizationId"
UNION ALL
SELECT 'class_year', class."id"
FROM "SchoolClass" class
JOIN "AcademicYear" year ON year."id" = class."academicYearId"
WHERE year."organizationId" <> class."organizationId"
UNION ALL
SELECT 'enrollment_class', enrollment."id"
FROM "SchoolEnrollment" enrollment
JOIN "SchoolClass" class ON class."id" = enrollment."schoolClassId"
WHERE class."organizationId" <> enrollment."organizationId"
UNION ALL
SELECT 'offering_class', offering."id"
FROM "SubjectOffering" offering
JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
WHERE class."organizationId" <> offering."organizationId"
UNION ALL
SELECT 'offering_subject', offering."id"
FROM "SubjectOffering" offering
JOIN "SchoolSubject" subject ON subject."id" = offering."subjectId"
WHERE subject."organizationId" <> offering."organizationId"
UNION ALL
SELECT 'membership_campus', membership."id"
FROM "SchoolMembership" membership
JOIN "SchoolCampus" campus ON campus."id" = membership."campusId"
WHERE campus."organizationId" <> membership."organizationId";
```

Auditar também relações protegidas por trigger:

```sql
SELECT event."id"
FROM "SchoolEvent" event
LEFT JOIN "SchoolCampus" campus ON campus."id" = event."campusId"
LEFT JOIN "SchoolClass" class ON class."id" = event."schoolClassId"
WHERE (event."campusId" IS NOT NULL AND campus."organizationId" <> event."organizationId")
   OR (event."schoolClassId" IS NOT NULL AND class."organizationId" <> event."organizationId")
   OR (event."campusId" IS NOT NULL AND event."schoolClassId" IS NOT NULL
       AND event."campusId" <> class."campusId");

SELECT 'session' AS kind, session."id"
FROM "ClassSession" session
JOIN "SubjectOffering" offering ON offering."id" = session."offeringId"
JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
JOIN "AcademicTerm" term ON term."id" = session."termId"
WHERE class."academicYearId" <> term."academicYearId"
UNION ALL
SELECT 'assessment', assessment."id"
FROM "Assessment" assessment
JOIN "SubjectOffering" offering ON offering."id" = assessment."offeringId"
JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
JOIN "AcademicTerm" term ON term."id" = assessment."termId"
WHERE class."academicYearId" <> term."academicYearId";
```

Cada divergência exige decisão baseada na fonte oficial da instituição. Não corrigir em massa copiando `organizationId` sem confirmar se a referência, a organização ou ambos estão errados. Registrar a correção em auditoria operacional.

### 3. Validação posterior

Depois de reparar o legado, validar as FKs:

```sql
ALTER TABLE "SchoolClass" VALIDATE CONSTRAINT "SchoolClass_campusId_organizationId_fkey";
ALTER TABLE "SchoolClass" VALIDATE CONSTRAINT "SchoolClass_academicYearId_organizationId_fkey";
ALTER TABLE "SchoolEnrollment" VALIDATE CONSTRAINT "SchoolEnrollment_schoolClassId_organizationId_fkey";
ALTER TABLE "SubjectOffering" VALIDATE CONSTRAINT "SubjectOffering_schoolClassId_organizationId_fkey";
ALTER TABLE "SubjectOffering" VALIDATE CONSTRAINT "SubjectOffering_subjectId_organizationId_fkey";
```

Validar os checks no mesmo processo:

```sql
ALTER TABLE "AcademicYear" VALIDATE CONSTRAINT "AcademicYear_date_range_check";
ALTER TABLE "AcademicTerm" VALIDATE CONSTRAINT "AcademicTerm_order_check";
ALTER TABLE "AcademicTerm" VALIDATE CONSTRAINT "AcademicTerm_date_range_check";
ALTER TABLE "SchoolSubject" VALIDATE CONSTRAINT "SchoolSubject_workloadMinutes_check";
ALTER TABLE "SchoolClass" VALIDATE CONSTRAINT "SchoolClass_capacity_check";
ALTER TABLE "SchoolEnrollment" VALIDATE CONSTRAINT "SchoolEnrollment_date_range_check";
ALTER TABLE "TimetableEntry" VALIDATE CONSTRAINT "TimetableEntry_time_range_check";
ALTER TABLE "TimetableEntry" VALIDATE CONSTRAINT "TimetableEntry_date_range_check";
ALTER TABLE "ClassSession" VALIDATE CONSTRAINT "ClassSession_time_range_check";
ALTER TABLE "ClassAttendanceRecord" VALIDATE CONSTRAINT "ClassAttendanceRecord_minutesPresent_check";
ALTER TABLE "Assessment" VALIDATE CONSTRAINT "Assessment_score_bounds_check";
ALTER TABLE "AssessmentGrade" VALIDATE CONSTRAINT "AssessmentGrade_score_check";
ALTER TABLE "SchoolEvent" VALIDATE CONSTRAINT "SchoolEvent_date_range_check";
```

Executar essa etapa em janela monitorada. `VALIDATE CONSTRAINT` evita o bloqueio exclusivo de uma recriação completa, mas ainda consome I/O e adquire locks; medir primeiro em uma cópia representativa.

O rollout termina somente quando:

- as consultas de auditoria retornam zero linhas;
- todas as constraints estão validadas;
- não há recorrência de SQLSTATE `23514` causada por clientes legítimos;
- os fluxos de turma, oferta, chamada, avaliação e evento passam nos testes de integração.

## Rollback

Preferir roll-forward: corrigir o produtor ou os dados e manter as garantias. Um rollback de banco reabre a possibilidade de associações cruzadas e só deve ocorrer após rollback da aplicação para uma versão compatível.

Se a migration falhar antes de ser registrada pelo Prisma, restaurar o snapshot é a opção mais segura. Se ela foi concluída e o rollback for inevitável, executar em transação:

```sql
BEGIN;

DROP TRIGGER IF EXISTS "SchoolMembership_tenant_scope_trigger" ON "SchoolMembership";
DROP TRIGGER IF EXISTS "SchoolEvent_tenant_scope_trigger" ON "SchoolEvent";
DROP TRIGGER IF EXISTS "ClassSession_academic_year_scope_trigger" ON "ClassSession";
DROP TRIGGER IF EXISTS "Assessment_academic_year_scope_trigger" ON "Assessment";
DROP TRIGGER IF EXISTS "SchoolCampus_organization_immutable_trigger" ON "SchoolCampus";
DROP TRIGGER IF EXISTS "AcademicYear_organization_immutable_trigger" ON "AcademicYear";
DROP TRIGGER IF EXISTS "SchoolSubject_organization_immutable_trigger" ON "SchoolSubject";
DROP TRIGGER IF EXISTS "SchoolClass_organization_immutable_trigger" ON "SchoolClass";
DROP TRIGGER IF EXISTS "SubjectOffering_organization_immutable_trigger" ON "SubjectOffering";
DROP TRIGGER IF EXISTS "AcademicTerm_parent_scope_trigger" ON "AcademicTerm";
DROP TRIGGER IF EXISTS "SchoolClass_parent_scope_trigger" ON "SchoolClass";
DROP TRIGGER IF EXISTS "SubjectOffering_parent_scope_trigger" ON "SubjectOffering";
DROP FUNCTION IF EXISTS "assert_school_optional_tenant_scope"();
DROP FUNCTION IF EXISTS "assert_school_academic_year_scope"();
DROP FUNCTION IF EXISTS "assert_school_organization_immutable"();
DROP FUNCTION IF EXISTS "assert_school_parent_scope_update"();

ALTER TABLE "SchoolClass" DROP CONSTRAINT IF EXISTS "SchoolClass_campusId_organizationId_fkey";
ALTER TABLE "SchoolClass" DROP CONSTRAINT IF EXISTS "SchoolClass_academicYearId_organizationId_fkey";
ALTER TABLE "SchoolEnrollment" DROP CONSTRAINT IF EXISTS "SchoolEnrollment_schoolClassId_organizationId_fkey";
ALTER TABLE "SubjectOffering" DROP CONSTRAINT IF EXISTS "SubjectOffering_schoolClassId_organizationId_fkey";
ALTER TABLE "SubjectOffering" DROP CONSTRAINT IF EXISTS "SubjectOffering_subjectId_organizationId_fkey";

ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_schoolClassId_fkey"
  FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_schoolClassId_fkey"
  FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcademicYear" DROP CONSTRAINT IF EXISTS "AcademicYear_date_range_check";
ALTER TABLE "AcademicTerm" DROP CONSTRAINT IF EXISTS "AcademicTerm_order_check";
ALTER TABLE "AcademicTerm" DROP CONSTRAINT IF EXISTS "AcademicTerm_date_range_check";
ALTER TABLE "SchoolSubject" DROP CONSTRAINT IF EXISTS "SchoolSubject_workloadMinutes_check";
ALTER TABLE "SchoolClass" DROP CONSTRAINT IF EXISTS "SchoolClass_capacity_check";
ALTER TABLE "SchoolEnrollment" DROP CONSTRAINT IF EXISTS "SchoolEnrollment_date_range_check";
ALTER TABLE "TimetableEntry" DROP CONSTRAINT IF EXISTS "TimetableEntry_time_range_check";
ALTER TABLE "TimetableEntry" DROP CONSTRAINT IF EXISTS "TimetableEntry_date_range_check";
ALTER TABLE "ClassSession" DROP CONSTRAINT IF EXISTS "ClassSession_time_range_check";
ALTER TABLE "ClassAttendanceRecord" DROP CONSTRAINT IF EXISTS "ClassAttendanceRecord_minutesPresent_check";
ALTER TABLE "Assessment" DROP CONSTRAINT IF EXISTS "Assessment_score_bounds_check";
ALTER TABLE "AssessmentGrade" DROP CONSTRAINT IF EXISTS "AssessmentGrade_score_check";
ALTER TABLE "SchoolEvent" DROP CONSTRAINT IF EXISTS "SchoolEvent_date_range_check";

DROP INDEX IF EXISTS "SchoolCampus_id_organizationId_key";
DROP INDEX IF EXISTS "AcademicYear_id_organizationId_key";
DROP INDEX IF EXISTS "SchoolSubject_id_organizationId_key";
DROP INDEX IF EXISTS "SchoolClass_id_organizationId_key";
DROP INDEX IF EXISTS "SchoolEnrollment_organizationId_studentId_status_idx";

COMMIT;
```

Após rollback manual, reconciliar a tabela de migrations do Prisma conforme o procedimento operacional adotado. Não marcar uma migration como revertida sem confirmar que todo o SQL de rollback concluiu e que o schema antigo foi restaurado.

## Risco aberto: `Course` global

`Course` pertence ao LMS global e não possui `organizationId`. `SchoolClass.courseId` é opcional e aponta diretamente para esse catálogo. Portanto, as FKs multi-tenant escolares não provam propriedade institucional do conteúdo.

Consequências atuais:

- duas organizações podem apontar turmas para o mesmo curso;
- conhecer/receber um `courseId` permite tentar associá-lo a uma turma sem uma regra de ownership no banco;
- o significado do vínculo diverge entre perfis: acesso de estudante usa `CourseEnrollment`, enquanto outros fluxos podem inferir acesso a partir de `SchoolClass.courseId`;
- exclusividade de conteúdo por instituição não pode ser alegada com o modelo atual.

É necessária uma decisão de produto e arquitetura antes de adicionar constraints:

1. **Catálogo global compartilhável:** cursos são ativos da plataforma, e uma relação explícita organização-curso deve registrar licença/autorização de uso. `SchoolClass` só poderá apontar cursos autorizados para sua organização.
2. **Curso pertencente ao tenant:** adicionar ownership organizacional ao curso e migrar conteúdos existentes, com uma política separada para modelos/copias compartilhadas.

Até essa decisão, tratar `SchoolClass.courseId` como integração funcional, não como fronteira de autorização. Toda concessão de acesso a mídia deve continuar dependendo de matrícula/atribuição verificável, e a documentação de segurança não deve declarar isolamento institucional do catálogo LMS.
