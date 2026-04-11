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

// Jours de la semaine
export const DAYS_OF_WEEK = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday',
} as const;

export const DAYS_LIST = [
  DAYS_OF_WEEK.MONDAY,
  DAYS_OF_WEEK.TUESDAY,
  DAYS_OF_WEEK.WEDNESDAY,
  DAYS_OF_WEEK.THURSDAY,
  DAYS_OF_WEEK.FRIDAY,
  DAYS_OF_WEEK.SATURDAY,
  DAYS_OF_WEEK.SUNDAY,
] as const;

// Types de devoirs
export const ASSIGNMENT_TYPES = {
  HOMEWORK: 'homework',
  PROJECT: 'project',
  EXAM: 'exam',
  EXERCISE: 'exercise',
  REPORT: 'report',
  COURSE: 'course',
} as const;

// Statuts des soumissions
export const SUBMISSION_STATUS = {
  SUBMITTED: 'submitted',
  LATE: 'late',
  GRADED: 'graded',
  MISSING: 'missing',
} as const;

// Statuts des présences
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
} as const;

// Types de notifications
export const NOTIFICATION_TYPES = {
  GRADE: 'grade',
  ASSIGNMENT: 'assignment',
  ABSENCE: 'absence',
  MESSAGE: 'message',
  ANNOUNCEMENT: 'announcement',
  PAYMENT: 'payment',
  MEETING: 'meeting',
  GENERAL: 'general',
} as const;

// Genres
export const GENDERS = {
  MALE: 'male',
  FEMALE: 'female',
} as const;

// Fichiers max size (en bytes)
export const MAX_FILE_SIZE = {
  AVATAR: 2 * 1024 * 1024, // 2MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  ASSIGNMENT: 20 * 1024 * 1024, // 20MB
  SUBMISSION: 20 * 1024 * 1024, // 20MB
} as const;

// Formats acceptés
export const ALLOWED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ALL: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'],
} as const;

// Cache TTL (en secondes)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;