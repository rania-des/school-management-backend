export const ROLES = {
  STUDENT: 'student',
  PARENT: 'parent',
  TEACHER: 'teacher',
  ADMIN: 'admin',
} as const;

export const GRADE_PERIODS = {
  TRIMESTER_1: 'trimester_1',
  TRIMESTER_2: 'trimester_2',
  TRIMESTER_3: 'trimester_3',
  SEMESTER_1: 'semester_1',
  SEMESTER_2: 'semester_2',
  ANNUAL: 'annual',
} as const;

export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  RECEIPTS: 'receipts',
  DOCUMENTS: 'documents',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const HTTP_STATUS = {
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
} as const;
