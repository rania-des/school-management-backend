"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = exports.ALLOWED_FILE_TYPES = exports.MAX_FILE_SIZE = exports.GENDERS = exports.NOTIFICATION_TYPES = exports.ATTENDANCE_STATUS = exports.SUBMISSION_STATUS = exports.ASSIGNMENT_TYPES = exports.DAYS_LIST = exports.DAYS_OF_WEEK = exports.HTTP_STATUS = exports.PAGINATION = exports.STORAGE_BUCKETS = exports.GRADE_PERIODS = exports.ROLES = void 0;
exports.ROLES = {
    STUDENT: 'student',
    PARENT: 'parent',
    TEACHER: 'teacher',
    ADMIN: 'admin',
};
exports.GRADE_PERIODS = {
    TRIMESTER_1: 'trimester_1',
    TRIMESTER_2: 'trimester_2',
    TRIMESTER_3: 'trimester_3',
    SEMESTER_1: 'semester_1',
    SEMESTER_2: 'semester_2',
    ANNUAL: 'annual',
};
exports.STORAGE_BUCKETS = {
    AVATARS: 'avatars',
    ASSIGNMENTS: 'assignments',
    SUBMISSIONS: 'submissions',
    RECEIPTS: 'receipts',
    DOCUMENTS: 'documents',
};
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
};
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    INTERNAL: 500,
};
// Jours de la semaine
exports.DAYS_OF_WEEK = {
    MONDAY: 'monday',
    TUESDAY: 'tuesday',
    WEDNESDAY: 'wednesday',
    THURSDAY: 'thursday',
    FRIDAY: 'friday',
    SATURDAY: 'saturday',
    SUNDAY: 'sunday',
};
exports.DAYS_LIST = [
    exports.DAYS_OF_WEEK.MONDAY,
    exports.DAYS_OF_WEEK.TUESDAY,
    exports.DAYS_OF_WEEK.WEDNESDAY,
    exports.DAYS_OF_WEEK.THURSDAY,
    exports.DAYS_OF_WEEK.FRIDAY,
    exports.DAYS_OF_WEEK.SATURDAY,
    exports.DAYS_OF_WEEK.SUNDAY,
];
// Types de devoirs
exports.ASSIGNMENT_TYPES = {
    HOMEWORK: 'homework',
    PROJECT: 'project',
    EXAM: 'exam',
    EXERCISE: 'exercise',
    REPORT: 'report',
    COURSE: 'course',
};
// Statuts des soumissions
exports.SUBMISSION_STATUS = {
    SUBMITTED: 'submitted',
    LATE: 'late',
    GRADED: 'graded',
    MISSING: 'missing',
};
// Statuts des présences
exports.ATTENDANCE_STATUS = {
    PRESENT: 'present',
    ABSENT: 'absent',
    LATE: 'late',
};
// Types de notifications
exports.NOTIFICATION_TYPES = {
    GRADE: 'grade',
    ASSIGNMENT: 'assignment',
    ABSENCE: 'absence',
    MESSAGE: 'message',
    ANNOUNCEMENT: 'announcement',
    PAYMENT: 'payment',
    MEETING: 'meeting',
    GENERAL: 'general',
};
// Genres
exports.GENDERS = {
    MALE: 'male',
    FEMALE: 'female',
};
// Fichiers max size (en bytes)
exports.MAX_FILE_SIZE = {
    AVATAR: 2 * 1024 * 1024, // 2MB
    DOCUMENT: 10 * 1024 * 1024, // 10MB
    ASSIGNMENT: 20 * 1024 * 1024, // 20MB
    SUBMISSION: 20 * 1024 * 1024, // 20MB
};
// Formats acceptés
exports.ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ALL: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'],
};
// Cache TTL (en secondes)
exports.CACHE_TTL = {
    SHORT: 60, // 1 minute
    MEDIUM: 300, // 5 minutes
    LONG: 3600, // 1 hour
    DAY: 86400, // 24 hours
};
//# sourceMappingURL=constants.js.map