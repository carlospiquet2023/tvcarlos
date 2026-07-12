ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GUARDIAN';

CREATE TYPE "SchoolOrganizationStatus" AS ENUM ('SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "SchoolRole" AS ENUM ('ORGANIZATION_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'SECRETARY', 'TEACHER', 'COUNSELOR', 'FINANCE', 'LIBRARIAN', 'SUPPORT', 'GUARDIAN', 'STUDENT', 'AUDITOR');
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "SchoolShift" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'FULL_TIME', 'FLEXIBLE');
CREATE TYPE "SchoolEnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ClassSessionStatus" AS ENUM ('PLANNED', 'OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ClassAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'REMOTE');
CREATE TYPE "AssessmentType" AS ENUM ('EXAM', 'QUIZ', 'ASSIGNMENT', 'PROJECT', 'PRESENTATION', 'PRACTICAL', 'PARTICIPATION', 'RECOVERY', 'OTHER');
CREATE TYPE "GradeEntryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'EXCUSED', 'MISSING');
CREATE TYPE "InterventionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CANCELLED');
CREATE TYPE "InterventionRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "SchoolOrganization" (
    "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "legalName" TEXT,
    "inepCode" TEXT, "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "SchoolOrganizationStatus" NOT NULL DEFAULT 'SETUP', "settingsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolOrganization_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolCampus" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
    "inepCode" TEXT, "email" TEXT, "phone" TEXT, "addressJson" TEXT, "timezone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SchoolCampus_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolMembership" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "campusId" TEXT, "userId" TEXT NOT NULL,
    "role" "SchoolRole" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolMembership_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL, "status" "AcademicPeriodStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL, "academicYearId" TEXT NOT NULL, "name" TEXT NOT NULL, "order" INTEGER NOT NULL,
    "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "status" "AcademicPeriodStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolSubject" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
    "knowledgeArea" TEXT, "bnccArea" TEXT, "workloadMinutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SchoolSubject_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "campusId" TEXT NOT NULL, "academicYearId" TEXT NOT NULL,
    "courseId" TEXT, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "gradeLevel" TEXT NOT NULL,
    "educationStage" TEXT, "shift" "SchoolShift" NOT NULL DEFAULT 'MORNING', "capacity" INTEGER,
    "room" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolEnrollment" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "schoolClassId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
    "enrollmentCode" TEXT, "status" "SchoolEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leftAt" TIMESTAMP(3), "finalOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GuardianLink" (
    "id" TEXT NOT NULL, "guardianId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "relationship" TEXT NOT NULL,
    "primaryContact" BOOLEAN NOT NULL DEFAULT false, "financialResponsible" BOOLEAN NOT NULL DEFAULT false,
    "pickupAuthorized" BOOLEAN NOT NULL DEFAULT false, "receivesNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuardianLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SubjectOffering" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "schoolClassId" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
    "teacherId" TEXT, "weeklyMinutes" INTEGER NOT NULL DEFAULT 0, "gradingPolicyJson" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL, "offeringId" TEXT NOT NULL, "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL, "endMinute" INTEGER NOT NULL, "room" TEXT,
    "validFrom" DATE, "validUntil" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL, "offeringId" TEXT NOT NULL, "termId" TEXT NOT NULL, "date" DATE NOT NULL,
    "startMinute" INTEGER, "endMinute" INTEGER, "topic" TEXT, "content" TEXT, "homework" TEXT,
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'PLANNED', "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClassAttendanceRecord" (
    "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
    "status" "ClassAttendanceStatus" NOT NULL DEFAULT 'PRESENT', "minutesPresent" INTEGER,
    "justification" TEXT, "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassAttendanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL, "offeringId" TEXT NOT NULL, "termId" TEXT NOT NULL, "title" TEXT NOT NULL,
    "description" TEXT, "type" "AssessmentType" NOT NULL DEFAULT 'ASSIGNMENT', "dueAt" TIMESTAMP(3),
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10, "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "published" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AssessmentGrade" (
    "id" TEXT NOT NULL, "assessmentId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION, "feedback" TEXT, "status" "GradeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "gradedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AssessmentGrade_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CurriculumCompetency" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
    "description" TEXT, "framework" TEXT NOT NULL DEFAULT 'BNCC', "stage" TEXT, "knowledgeArea" TEXT,
    "parentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CurriculumCompetency_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AssessmentCompetency" (
    "assessmentId" TEXT NOT NULL, "competencyId" TEXT NOT NULL,
    CONSTRAINT "AssessmentCompetency_pkey" PRIMARY KEY ("assessmentId","competencyId")
);
CREATE TABLE "StudentCompetency" (
    "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "competencyId" TEXT NOT NULL, "termId" TEXT NOT NULL,
    "level" DOUBLE PRECISION NOT NULL, "evidence" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StudentCompetency_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StudentIntervention" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "assignedToId" TEXT,
    "title" TEXT NOT NULL, "reason" TEXT NOT NULL, "plan" TEXT,
    "riskLevel" "InterventionRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "InterventionStatus" NOT NULL DEFAULT 'OPEN', "dueAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentIntervention_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SchoolEvent" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "campusId" TEXT, "schoolClassId" TEXT,
    "title" TEXT NOT NULL, "description" TEXT, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false, "eventType" TEXT NOT NULL DEFAULT 'ACADEMIC', "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolOrganization_slug_key" ON "SchoolOrganization"("slug");
CREATE INDEX "SchoolOrganization_status_idx" ON "SchoolOrganization"("status");
CREATE INDEX "SchoolOrganization_inepCode_idx" ON "SchoolOrganization"("inepCode");
CREATE INDEX "SchoolCampus_organizationId_active_idx" ON "SchoolCampus"("organizationId", "active");
CREATE INDEX "SchoolCampus_inepCode_idx" ON "SchoolCampus"("inepCode");
CREATE UNIQUE INDEX "SchoolCampus_organizationId_code_key" ON "SchoolCampus"("organizationId", "code");
CREATE INDEX "SchoolMembership_organizationId_role_active_idx" ON "SchoolMembership"("organizationId", "role", "active");
CREATE INDEX "SchoolMembership_campusId_idx" ON "SchoolMembership"("campusId");
CREATE INDEX "SchoolMembership_userId_idx" ON "SchoolMembership"("userId");
CREATE UNIQUE INDEX "SchoolMembership_organizationId_userId_key" ON "SchoolMembership"("organizationId", "userId");
CREATE INDEX "AcademicYear_organizationId_status_idx" ON "AcademicYear"("organizationId", "status");
CREATE INDEX "AcademicYear_startDate_endDate_idx" ON "AcademicYear"("startDate", "endDate");
CREATE UNIQUE INDEX "AcademicYear_organizationId_name_key" ON "AcademicYear"("organizationId", "name");
CREATE INDEX "AcademicTerm_academicYearId_status_idx" ON "AcademicTerm"("academicYearId", "status");
CREATE UNIQUE INDEX "AcademicTerm_academicYearId_order_key" ON "AcademicTerm"("academicYearId", "order");
CREATE INDEX "SchoolSubject_organizationId_active_idx" ON "SchoolSubject"("organizationId", "active");
CREATE UNIQUE INDEX "SchoolSubject_organizationId_code_key" ON "SchoolSubject"("organizationId", "code");
CREATE INDEX "SchoolClass_organizationId_active_idx" ON "SchoolClass"("organizationId", "active");
CREATE INDEX "SchoolClass_campusId_academicYearId_idx" ON "SchoolClass"("campusId", "academicYearId");
CREATE UNIQUE INDEX "SchoolClass_organizationId_academicYearId_code_key" ON "SchoolClass"("organizationId", "academicYearId", "code");
CREATE INDEX "SchoolEnrollment_organizationId_status_idx" ON "SchoolEnrollment"("organizationId", "status");
CREATE INDEX "SchoolEnrollment_studentId_status_idx" ON "SchoolEnrollment"("studentId", "status");
CREATE INDEX "SchoolEnrollment_enrollmentCode_idx" ON "SchoolEnrollment"("enrollmentCode");
CREATE UNIQUE INDEX "SchoolEnrollment_schoolClassId_studentId_key" ON "SchoolEnrollment"("schoolClassId", "studentId");
CREATE INDEX "GuardianLink_studentId_primaryContact_idx" ON "GuardianLink"("studentId", "primaryContact");
CREATE UNIQUE INDEX "GuardianLink_guardianId_studentId_key" ON "GuardianLink"("guardianId", "studentId");
CREATE INDEX "SubjectOffering_organizationId_active_idx" ON "SubjectOffering"("organizationId", "active");
CREATE INDEX "SubjectOffering_teacherId_active_idx" ON "SubjectOffering"("teacherId", "active");
CREATE UNIQUE INDEX "SubjectOffering_schoolClassId_subjectId_key" ON "SubjectOffering"("schoolClassId", "subjectId");
CREATE INDEX "TimetableEntry_dayOfWeek_startMinute_idx" ON "TimetableEntry"("dayOfWeek", "startMinute");
CREATE UNIQUE INDEX "TimetableEntry_offeringId_dayOfWeek_startMinute_key" ON "TimetableEntry"("offeringId", "dayOfWeek", "startMinute");
CREATE INDEX "ClassSession_termId_date_idx" ON "ClassSession"("termId", "date");
CREATE INDEX "ClassSession_createdById_idx" ON "ClassSession"("createdById");
CREATE UNIQUE INDEX "ClassSession_offeringId_date_startMinute_key" ON "ClassSession"("offeringId", "date", "startMinute");
CREATE INDEX "ClassAttendanceRecord_studentId_status_idx" ON "ClassAttendanceRecord"("studentId", "status");
CREATE UNIQUE INDEX "ClassAttendanceRecord_sessionId_studentId_key" ON "ClassAttendanceRecord"("sessionId", "studentId");
CREATE INDEX "Assessment_offeringId_termId_idx" ON "Assessment"("offeringId", "termId");
CREATE INDEX "Assessment_dueAt_idx" ON "Assessment"("dueAt");
CREATE INDEX "AssessmentGrade_studentId_status_idx" ON "AssessmentGrade"("studentId", "status");
CREATE UNIQUE INDEX "AssessmentGrade_assessmentId_studentId_key" ON "AssessmentGrade"("assessmentId", "studentId");
CREATE INDEX "CurriculumCompetency_organizationId_stage_idx" ON "CurriculumCompetency"("organizationId", "stage");
CREATE INDEX "CurriculumCompetency_parentId_idx" ON "CurriculumCompetency"("parentId");
CREATE UNIQUE INDEX "CurriculumCompetency_organizationId_framework_code_key" ON "CurriculumCompetency"("organizationId", "framework", "code");
CREATE INDEX "AssessmentCompetency_competencyId_idx" ON "AssessmentCompetency"("competencyId");
CREATE INDEX "StudentCompetency_competencyId_level_idx" ON "StudentCompetency"("competencyId", "level");
CREATE UNIQUE INDEX "StudentCompetency_studentId_competencyId_termId_key" ON "StudentCompetency"("studentId", "competencyId", "termId");
CREATE INDEX "StudentIntervention_organizationId_status_riskLevel_idx" ON "StudentIntervention"("organizationId", "status", "riskLevel");
CREATE INDEX "StudentIntervention_studentId_status_idx" ON "StudentIntervention"("studentId", "status");
CREATE INDEX "StudentIntervention_assignedToId_status_idx" ON "StudentIntervention"("assignedToId", "status");
CREATE INDEX "SchoolEvent_organizationId_startsAt_idx" ON "SchoolEvent"("organizationId", "startsAt");
CREATE INDEX "SchoolEvent_campusId_startsAt_idx" ON "SchoolEvent"("campusId", "startsAt");
CREATE INDEX "SchoolEvent_schoolClassId_startsAt_idx" ON "SchoolEvent"("schoolClassId", "startsAt");

ALTER TABLE "SchoolCampus" ADD CONSTRAINT "SchoolCampus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolMembership" ADD CONSTRAINT "SchoolMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolSubject" ADD CONSTRAINT "SchoolSubject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassAttendanceRecord" ADD CONSTRAINT "ClassAttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassAttendanceRecord" ADD CONSTRAINT "ClassAttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentGrade" ADD CONSTRAINT "AssessmentGrade_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentGrade" ADD CONSTRAINT "AssessmentGrade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurriculumCompetency" ADD CONSTRAINT "CurriculumCompetency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurriculumCompetency" ADD CONSTRAINT "CurriculumCompetency_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CurriculumCompetency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssessmentCompetency" ADD CONSTRAINT "AssessmentCompetency_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentCompetency" ADD CONSTRAINT "AssessmentCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "CurriculumCompetency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentCompetency" ADD CONSTRAINT "StudentCompetency_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentCompetency" ADD CONSTRAINT "StudentCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "CurriculumCompetency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentCompetency" ADD CONSTRAINT "StudentCompetency_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIntervention" ADD CONSTRAINT "StudentIntervention_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIntervention" ADD CONSTRAINT "StudentIntervention_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIntervention" ADD CONSTRAINT "StudentIntervention_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "SchoolOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolEvent" ADD CONSTRAINT "SchoolEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
