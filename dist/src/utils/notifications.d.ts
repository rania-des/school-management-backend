export type NotificationType = 'grade' | 'assignment' | 'absence' | 'message' | 'announcement' | 'payment' | 'meeting' | 'general';
export interface CreateNotificationParams {
    recipientId: string;
    type: NotificationType;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
}
export declare const createNotification: (params: CreateNotificationParams) => Promise<{
    success: boolean;
} | null>;
export declare const createBulkNotifications: (recipientIds: string[], params: Omit<CreateNotificationParams, "recipientId">) => Promise<{
    success: boolean;
    count: number;
    error?: undefined;
} | {
    success: boolean;
    error: unknown;
    count: number;
}>;
export declare const getClassStudentProfileIds: (classId: string) => Promise<string[]>;
export declare const getClassAllProfileIds: (classId: string) => Promise<string[]>;
export declare const getStudentParentProfileIds: (studentId: string) => Promise<string[]>;
export declare const markNotificationAsRead: (notificationId: string, userId: string) => Promise<boolean>;
export declare const markAllNotificationsAsRead: (userId: string) => Promise<boolean>;
//# sourceMappingURL=notifications.d.ts.map