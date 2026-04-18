export interface NotificationPayload {
    userId: string;
    title: string;
    body: string;
    type?: 'grade' | 'attendance' | 'payment' | 'meeting' | 'announcement' | 'assignment' | 'general';
    data?: Record<string, any>;
}
export declare class NotificationService {
    static create(payload: NotificationPayload): Promise<boolean>;
    static createMany(payloads: NotificationPayload[]): Promise<void>;
}
//# sourceMappingURL=notification.service.d.ts.map