"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_STATUS = exports.PAGINATION = exports.STORAGE_BUCKETS = exports.GRADE_PERIODS = exports.ROLES = void 0;
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
//# sourceMappingURL=constants.js.map