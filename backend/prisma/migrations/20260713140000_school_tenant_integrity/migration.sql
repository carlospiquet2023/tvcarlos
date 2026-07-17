-- Tenant integrity for the school bounded context.
--
-- Composite foreign keys are intentionally added NOT VALID: PostgreSQL enforces
-- them for all new/updated rows while allowing a deployment to complete when
-- legacy inconsistencies exist. After repairing any legacy rows, operators can
-- validate each constraint online with ALTER TABLE ... VALIDATE CONSTRAINT.

DO $$
DECLARE
    violation_count BIGINT;
BEGIN
    SELECT count(*) INTO violation_count
    FROM (
        SELECT class."id"
        FROM "SchoolClass" class
        JOIN "SchoolCampus" campus ON campus."id" = class."campusId"
        WHERE campus."organizationId" <> class."organizationId"
        UNION ALL
        SELECT class."id"
        FROM "SchoolClass" class
        JOIN "AcademicYear" year ON year."id" = class."academicYearId"
        WHERE year."organizationId" <> class."organizationId"
        UNION ALL
        SELECT enrollment."id"
        FROM "SchoolEnrollment" enrollment
        JOIN "SchoolClass" class ON class."id" = enrollment."schoolClassId"
        WHERE class."organizationId" <> enrollment."organizationId"
        UNION ALL
        SELECT offering."id"
        FROM "SubjectOffering" offering
        JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
        WHERE class."organizationId" <> offering."organizationId"
        UNION ALL
        SELECT offering."id"
        FROM "SubjectOffering" offering
        JOIN "SchoolSubject" subject ON subject."id" = offering."subjectId"
        WHERE subject."organizationId" <> offering."organizationId"
        UNION ALL
        SELECT membership."id"
        FROM "SchoolMembership" membership
        JOIN "SchoolCampus" campus ON campus."id" = membership."campusId"
        WHERE campus."organizationId" <> membership."organizationId"
    ) violations;

    IF violation_count > 0 THEN
        RAISE WARNING '% legacy cross-tenant school associations require repair before constraint validation', violation_count;
    END IF;
END;
$$;

CREATE UNIQUE INDEX "SchoolCampus_id_organizationId_key"
    ON "SchoolCampus"("id", "organizationId");
CREATE UNIQUE INDEX "AcademicYear_id_organizationId_key"
    ON "AcademicYear"("id", "organizationId");
CREATE UNIQUE INDEX "SchoolSubject_id_organizationId_key"
    ON "SchoolSubject"("id", "organizationId");
CREATE UNIQUE INDEX "SchoolClass_id_organizationId_key"
    ON "SchoolClass"("id", "organizationId");
CREATE INDEX "SchoolEnrollment_organizationId_studentId_status_idx"
    ON "SchoolEnrollment"("organizationId", "studentId", "status");

ALTER TABLE "SchoolClass" DROP CONSTRAINT "SchoolClass_campusId_fkey";
ALTER TABLE "SchoolClass" DROP CONSTRAINT "SchoolClass_academicYearId_fkey";
ALTER TABLE "SchoolEnrollment" DROP CONSTRAINT "SchoolEnrollment_schoolClassId_fkey";
ALTER TABLE "SubjectOffering" DROP CONSTRAINT "SubjectOffering_schoolClassId_fkey";
ALTER TABLE "SubjectOffering" DROP CONSTRAINT "SubjectOffering_subjectId_fkey";

ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_campusId_organizationId_fkey"
    FOREIGN KEY ("campusId", "organizationId")
    REFERENCES "SchoolCampus"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_organizationId_fkey"
    FOREIGN KEY ("academicYearId", "organizationId")
    REFERENCES "AcademicYear"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_schoolClassId_organizationId_fkey"
    FOREIGN KEY ("schoolClassId", "organizationId")
    REFERENCES "SchoolClass"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_schoolClassId_organizationId_fkey"
    FOREIGN KEY ("schoolClassId", "organizationId")
    REFERENCES "SchoolClass"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_organizationId_fkey"
    FOREIGN KEY ("subjectId", "organizationId")
    REFERENCES "SchoolSubject"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Optional relationships cannot use ON DELETE SET NULL with a shared, required
-- organizationId in a composite FK. Triggers preserve existing delete semantics
-- and reject new cross-tenant associations.
CREATE OR REPLACE FUNCTION "assert_school_optional_tenant_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    referenced_organization_id TEXT;
    referenced_campus_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'SchoolMembership' AND NEW."campusId" IS NOT NULL THEN
        SELECT "organizationId" INTO referenced_organization_id
        FROM "SchoolCampus" WHERE "id" = NEW."campusId";
        IF referenced_organization_id IS DISTINCT FROM NEW."organizationId" THEN
            RAISE EXCEPTION 'SchoolMembership campus belongs to another organization'
                USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'SchoolEvent' THEN
        IF NEW."campusId" IS NOT NULL THEN
            SELECT "organizationId" INTO referenced_organization_id
            FROM "SchoolCampus" WHERE "id" = NEW."campusId";
            IF referenced_organization_id IS DISTINCT FROM NEW."organizationId" THEN
                RAISE EXCEPTION 'SchoolEvent campus belongs to another organization'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
        IF NEW."schoolClassId" IS NOT NULL THEN
            SELECT "organizationId", "campusId"
            INTO referenced_organization_id, referenced_campus_id
            FROM "SchoolClass" WHERE "id" = NEW."schoolClassId";
            IF referenced_organization_id IS DISTINCT FROM NEW."organizationId" THEN
                RAISE EXCEPTION 'SchoolEvent class belongs to another organization'
                    USING ERRCODE = '23514';
            END IF;
            IF NEW."campusId" IS NOT NULL AND referenced_campus_id IS DISTINCT FROM NEW."campusId" THEN
                RAISE EXCEPTION 'SchoolEvent campus does not match its class campus'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "SchoolMembership_tenant_scope_trigger"
BEFORE INSERT OR UPDATE OF "organizationId", "campusId" ON "SchoolMembership"
FOR EACH ROW EXECUTE FUNCTION "assert_school_optional_tenant_scope"();

CREATE TRIGGER "SchoolEvent_tenant_scope_trigger"
BEFORE INSERT OR UPDATE OF "organizationId", "campusId", "schoolClassId" ON "SchoolEvent"
FOR EACH ROW EXECUTE FUNCTION "assert_school_optional_tenant_scope"();

-- Terms are owned indirectly by an academic year, while sessions and
-- assessments are owned indirectly by an offering's class. Keep both sides in
-- the same academic year without duplicating another organizationId column.
CREATE OR REPLACE FUNCTION "assert_school_academic_year_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    offering_academic_year_id TEXT;
    term_academic_year_id TEXT;
BEGIN
    SELECT class."academicYearId" INTO offering_academic_year_id
    FROM "SubjectOffering" offering
    JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
    WHERE offering."id" = NEW."offeringId";

    SELECT "academicYearId" INTO term_academic_year_id
    FROM "AcademicTerm" WHERE "id" = NEW."termId";

    IF offering_academic_year_id IS DISTINCT FROM term_academic_year_id THEN
        RAISE EXCEPTION '% term belongs to another academic year', TG_TABLE_NAME
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ClassSession_academic_year_scope_trigger"
BEFORE INSERT OR UPDATE OF "offeringId", "termId" ON "ClassSession"
FOR EACH ROW EXECUTE FUNCTION "assert_school_academic_year_scope"();

CREATE TRIGGER "Assessment_academic_year_scope_trigger"
BEFORE INSERT OR UPDATE OF "offeringId", "termId" ON "Assessment"
FOR EACH ROW EXECUTE FUNCTION "assert_school_academic_year_scope"();

-- Tenant ownership is an identity property. Moving an aggregate between
-- organizations via UPDATE can bypass child-side triggers through FK cascades,
-- so require an explicit data migration instead.
CREATE OR REPLACE FUNCTION "assert_school_organization_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
        RAISE EXCEPTION '% organization ownership is immutable', TG_TABLE_NAME
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "SchoolCampus_organization_immutable_trigger"
BEFORE UPDATE OF "organizationId" ON "SchoolCampus"
FOR EACH ROW EXECUTE FUNCTION "assert_school_organization_immutable"();
CREATE TRIGGER "AcademicYear_organization_immutable_trigger"
BEFORE UPDATE OF "organizationId" ON "AcademicYear"
FOR EACH ROW EXECUTE FUNCTION "assert_school_organization_immutable"();
CREATE TRIGGER "SchoolSubject_organization_immutable_trigger"
BEFORE UPDATE OF "organizationId" ON "SchoolSubject"
FOR EACH ROW EXECUTE FUNCTION "assert_school_organization_immutable"();
CREATE TRIGGER "SchoolClass_organization_immutable_trigger"
BEFORE UPDATE OF "organizationId" ON "SchoolClass"
FOR EACH ROW EXECUTE FUNCTION "assert_school_organization_immutable"();
CREATE TRIGGER "SubjectOffering_organization_immutable_trigger"
BEFORE UPDATE OF "organizationId" ON "SubjectOffering"
FOR EACH ROW EXECUTE FUNCTION "assert_school_organization_immutable"();

-- Child-side validation alone is insufficient when a referenced parent moves.
-- These checks allow harmless parent updates while rejecting changes that would
-- leave existing events, sessions or assessments outside their class scope.
CREATE OR REPLACE FUNCTION "assert_school_parent_scope_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_academic_year_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'AcademicTerm' THEN
        IF NEW."academicYearId" IS DISTINCT FROM OLD."academicYearId"
           AND EXISTS (
            SELECT 1
            FROM "ClassSession" session
            JOIN "SubjectOffering" offering ON offering."id" = session."offeringId"
            JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
            WHERE session."termId" = NEW."id"
              AND class."academicYearId" IS DISTINCT FROM NEW."academicYearId"
            UNION ALL
            SELECT 1
            FROM "Assessment" assessment
            JOIN "SubjectOffering" offering ON offering."id" = assessment."offeringId"
            JOIN "SchoolClass" class ON class."id" = offering."schoolClassId"
            WHERE assessment."termId" = NEW."id"
              AND class."academicYearId" IS DISTINCT FROM NEW."academicYearId"
           ) THEN
            RAISE EXCEPTION 'AcademicTerm move would invalidate dependent school records'
                USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'SchoolClass' THEN
        IF NEW."academicYearId" IS DISTINCT FROM OLD."academicYearId"
           AND EXISTS (
                SELECT 1
                FROM "ClassSession" session
                JOIN "SubjectOffering" offering ON offering."id" = session."offeringId"
                JOIN "AcademicTerm" term ON term."id" = session."termId"
                WHERE offering."schoolClassId" = NEW."id"
                  AND term."academicYearId" IS DISTINCT FROM NEW."academicYearId"
                UNION ALL
                SELECT 1
                FROM "Assessment" assessment
                JOIN "SubjectOffering" offering ON offering."id" = assessment."offeringId"
                JOIN "AcademicTerm" term ON term."id" = assessment."termId"
                WHERE offering."schoolClassId" = NEW."id"
                  AND term."academicYearId" IS DISTINCT FROM NEW."academicYearId"
           ) THEN
            RAISE EXCEPTION 'SchoolClass academic year change would invalidate dependent school records'
                USING ERRCODE = '23514';
        END IF;

        IF NEW."campusId" IS DISTINCT FROM OLD."campusId"
           AND EXISTS (
                SELECT 1 FROM "SchoolEvent" event
                WHERE event."schoolClassId" = NEW."id"
                  AND event."campusId" IS NOT NULL
                  AND event."campusId" IS DISTINCT FROM NEW."campusId"
           ) THEN
            RAISE EXCEPTION 'SchoolClass campus change would invalidate dependent events'
                USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'SubjectOffering' THEN
        IF NEW."schoolClassId" IS DISTINCT FROM OLD."schoolClassId" THEN
            SELECT "academicYearId" INTO target_academic_year_id
            FROM "SchoolClass" WHERE "id" = NEW."schoolClassId";

            IF EXISTS (
                SELECT 1
                FROM "ClassSession" session
                JOIN "AcademicTerm" term ON term."id" = session."termId"
                WHERE session."offeringId" = NEW."id"
                  AND term."academicYearId" IS DISTINCT FROM target_academic_year_id
                UNION ALL
                SELECT 1
                FROM "Assessment" assessment
                JOIN "AcademicTerm" term ON term."id" = assessment."termId"
                WHERE assessment."offeringId" = NEW."id"
                  AND term."academicYearId" IS DISTINCT FROM target_academic_year_id
            ) THEN
                RAISE EXCEPTION 'SubjectOffering class change would invalidate dependent school records'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AcademicTerm_parent_scope_trigger"
BEFORE UPDATE OF "academicYearId" ON "AcademicTerm"
FOR EACH ROW EXECUTE FUNCTION "assert_school_parent_scope_update"();
CREATE TRIGGER "SchoolClass_parent_scope_trigger"
BEFORE UPDATE OF "academicYearId", "campusId" ON "SchoolClass"
FOR EACH ROW EXECUTE FUNCTION "assert_school_parent_scope_update"();
CREATE TRIGGER "SubjectOffering_parent_scope_trigger"
BEFORE UPDATE OF "schoolClassId" ON "SubjectOffering"
FOR EACH ROW EXECUTE FUNCTION "assert_school_parent_scope_update"();

-- Domain bounds. NOT VALID keeps legacy rollout safe and still protects all new writes.
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_date_range_check"
    CHECK ("startDate" <= "endDate") NOT VALID;
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_order_check"
    CHECK ("order" > 0) NOT VALID;
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_date_range_check"
    CHECK ("startDate" <= "endDate") NOT VALID;
ALTER TABLE "SchoolSubject" ADD CONSTRAINT "SchoolSubject_workloadMinutes_check"
    CHECK ("workloadMinutes" >= 0) NOT VALID;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0) NOT VALID;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_date_range_check"
    CHECK ("leftAt" IS NULL OR "leftAt" >= "enrolledAt") NOT VALID;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_time_range_check"
    CHECK ("dayOfWeek" BETWEEN 1 AND 7
        AND "startMinute" BETWEEN 0 AND 1439
        AND "endMinute" BETWEEN 1 AND 1440
        AND "startMinute" < "endMinute") NOT VALID;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_date_range_check"
    CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" <= "validUntil") NOT VALID;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_time_range_check"
    CHECK (("startMinute" IS NULL AND "endMinute" IS NULL)
        OR ("startMinute" BETWEEN 0 AND 1439
            AND "endMinute" BETWEEN 1 AND 1440
            AND "startMinute" < "endMinute")) NOT VALID;
ALTER TABLE "ClassAttendanceRecord" ADD CONSTRAINT "ClassAttendanceRecord_minutesPresent_check"
    CHECK ("minutesPresent" IS NULL OR "minutesPresent" BETWEEN 0 AND 1440) NOT VALID;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_score_bounds_check"
    CHECK ("maxScore" > 0 AND "weight" >= 0) NOT VALID;
ALTER TABLE "AssessmentGrade" ADD CONSTRAINT "AssessmentGrade_score_check"
    CHECK ("score" IS NULL OR "score" >= 0) NOT VALID;
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_date_range_check"
    CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt") NOT VALID;
