type NotificationType = 'grade' | 'assignment' | 'absence' | 'message' | 'announcement' | 'payment' | 'meeting' | 'general';
interface CreateNotificationParams {
    recipientId: string;
    type: NotificationType;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
}
export declare const createNotification: (params: CreateNotificationParams) => Promise<void>;
export declare const createBulkNotifications: (recipientIds: string[], params: Omit<CreateNotificationParams, "recipientId">) => Promise<void>;
export declare const getClassStudentProfileIds: (classId: string) => Promise<string[]>;
export declare const getStudentParentProfileIds: (studentId: string) => Promise<string[]>;
export {};
//# sourceMappingURL=notifications.d.ts.map