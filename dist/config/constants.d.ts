export declare const ROLES: {
    readonly STUDENT: "student";
    readonly PARENT: "parent";
    readonly TEACHER: "teacher";
    readonly ADMIN: "admin";
};
export declare const GRADE_PERIODS: {
    readonly TRIMESTER_1: "trimester_1";
    readonly TRIMESTER_2: "trimester_2";
    readonly TRIMESTER_3: "trimester_3";
    readonly SEMESTER_1: "semester_1";
    readonly SEMESTER_2: "semester_2";
    readonly ANNUAL: "annual";
};
export declare const STORAGE_BUCKETS: {
    readonly AVATARS: "avatars";
    readonly ASSIGNMENTS: "assignments";
    readonly SUBMISSIONS: "submissions";
    readonly RECEIPTS: "receipts";
    readonly DOCUMENTS: "documents";
};
export declare const PAGINATION: {
    readonly DEFAULT_PAGE: 1;
    readonly DEFAULT_LIMIT: 20;
    readonly MAX_LIMIT: 100;
};
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly UNPROCESSABLE: 422;
    readonly INTERNAL: 500;
};
export declare const DAYS_OF_WEEK: {
    readonly MONDAY: "monday";
    readonly TUESDAY: "tuesday";
    readonly WEDNESDAY: "wednesday";
    readonly THURSDAY: "thursday";
    readonly FRIDAY: "friday";
    readonly SATURDAY: "saturday";
    readonly SUNDAY: "sunday";
};
export declare const DAYS_LIST: readonly ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export declare const ASSIGNMENT_TYPES: {
    readonly HOMEWORK: "homework";
    readonly PROJECT: "project";
    readonly EXAM: "exam";
    readonly EXERCISE: "exercise";
    readonly REPORT: "report";
    readonly COURSE: "course";
};
export declare const SUBMISSION_STATUS: {
    readonly SUBMITTED: "submitted";
    readonly LATE: "late";
    readonly GRADED: "graded";
    readonly MISSING: "missing";
};
export declare const ATTENDANCE_STATUS: {
    readonly PRESENT: "present";
    readonly ABSENT: "absent";
    readonly LATE: "late";
};
export declare const NOTIFICATION_TYPES: {
    readonly GRADE: "grade";
    readonly ASSIGNMENT: "assignment";
    readonly ABSENCE: "absence";
    readonly MESSAGE: "message";
    readonly ANNOUNCEMENT: "announcement";
    readonly PAYMENT: "payment";
    readonly MEETING: "meeting";
    readonly GENERAL: "general";
};
export declare const GENDERS: {
    readonly MALE: "male";
    readonly FEMALE: "female";
};
export declare const MAX_FILE_SIZE: {
    readonly AVATAR: number;
    readonly DOCUMENT: number;
    readonly ASSIGNMENT: number;
    readonly SUBMISSION: number;
};
export declare const ALLOWED_FILE_TYPES: {
    readonly IMAGES: readonly ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    readonly DOCUMENTS: readonly ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    readonly ALL: readonly ["image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf"];
};
export declare const CACHE_TTL: {
    readonly SHORT: 60;
    readonly MEDIUM: 300;
    readonly LONG: 3600;
    readonly DAY: 86400;
};
//# sourceMappingURL=constants.d.ts.map