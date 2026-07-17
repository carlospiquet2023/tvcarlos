export type AdminTab =
    | 'overview'
    | 'users'
    | 'courses'
    | 'audit'
    | 'reports'
    | 'notifications'
    | 'live'
    | 'moderation'
    | 'punishment'
    | 'broadcast'
    | 'privaterooms'
    | 'settings'
    | 'attendance';

export interface StatsData {
    totalUsers: number;
    totalCourses: number;
    totalVideos: number;
    processingVideos: number;
    readyVideos: number;
    pendingVideos: number;
    errorVideos: number;
    totalEnrollments: number;
    totalModules: number;
    totalLiveClasses: number;
}

export interface UserData {
    id: string;
    name: string;
    email: string;
    role: string;
    accessBlocked: boolean;
    accessBlockedAt?: string | null;
    accessBlockedReason?: string | null;
    createdAt: string;
}

export interface ModuleData {
    id: string;
    name: string;
    pdfUrl: string | null;
    videos: VideoData[];
    order?: number;
}

export interface VideoData {
    id: string;
    title: string;
    description: string | null;
    content: string | null;
    thumbnailUrl?: string | null;
    status: string;
    order: number;
}

export interface EnrollmentData {
    id: string;
    enrollmentRole: 'STUDENT' | 'TEACHER';
    user: { id: string; name: string; email: string };
}

export interface CourseData {
    id: string;
    name: string;
    description: string;
    thumbnailUrl: string | null;
    calendarUrl: string | null;
    modules: ModuleData[];
    enrollments: EnrollmentData[];
    order?: number;
}

export interface HealthData {
    uptime: number;
    memory: { process: number };
    services: { database: string; storage: string };
}

export interface AuditLogData {
    id: string;
    action: string;
    target?: string | null;
    details?: string | null;
    createdAt: string;
    user?: { name: string } | null;
}

export interface CourseReport {
    id: string;
    name: string;
    totalStudents: number;
    totalVideos: number;
    completionRate: number;
    completedLessons: number;
    totalPossibleLessons: number;
}

export interface LiveClassData {
    id: string;
    title: string;
    status: string;
    startAt: string;
    endAt?: string | null;
    zoomJoinUrl?: string | null;
    course?: { name: string } | null;
    module?: { name: string } | null;
}

export interface FlaggedComment {
    id: string;
    text: string;
    flagged: boolean;
    createdAt: string;
    user: { name: string; role: string };
    video: { title: string; module: { course: { name: string } } };
    reports: { id: string; reason: string; user: { name: string } }[];
}

export interface ViolationData {
    id: string;
    word: string;
    severity: string;
    autoAction?: string | null;
    createdAt: string;
    user: { name: string };
}

export interface BanData {
    id: string;
    active: boolean;
    banType: string;
    reason: string;
    createdAt: string;
    expiresAt?: string | null;
    user: { name: string };
}

export interface AppealData {
    id: string;
    status: string;
    reason: string;
    adminNote?: string | null;
    createdAt: string;
    user: { name: string; email: string };
}

export interface AttendanceEditData {
    oldStatus: string;
    newStatus: string;
    justification: string;
    editedBy?: { name: string } | null;
}

export interface AttendanceData {
    id?: string;
    userId: string;
    status: string;
    watchTimeSeconds?: number;
    autoDetected?: boolean;
    user?: { name: string; email: string };
    edits?: AttendanceEditData[];
}

export interface EmailStatusData {
    configured: boolean;
    missing: string[];
    host: string | null;
    port: number;
    secure: boolean;
    from: string | null;
}

export interface EmailDeliveryData {
    configured: boolean;
    eligible?: number;
    attempted: number;
    sent: number;
    failed: number;
}

export interface NewUserForm {
    name: string;
    email: string;
    password: string;
    role: string;
}

export interface EditUserForm {
    name: string;
    email: string;
    role: string;
}

export interface ExcelImportResult {
    name: string;
    email: string;
    password: string;
    enrolled: string[];
    error?: string;
}

export interface NewCourseForm {
    name: string;
    description: string;
    thumbnailUrl: string;
}

export interface NewModuleForm {
    courseId: string;
    name: string;
}

export interface VideoUploadForm {
    moduleId: string;
    title: string;
    file: File | null;
}

export interface EnrollmentForm {
    courseId: string;
    userId: string;
    enrollmentRole: string;
}

export type ConfirmationRequest = (message: string, action: () => void) => void;
