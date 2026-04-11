import nodemailer from 'nodemailer';
export declare const sendPasswordResetEmail: (email: string, resetLink: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const sendWelcomeEmail: (email: string, firstName: string, role: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const sendMeetingNotification: (email: string, firstName: string, meetingDate: string, teacherName: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const sendAbsenceNotification: (email: string, parentName: string, studentName: string, date: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const sendAssignmentNotification: (email: string, studentName: string, assignmentTitle: string, dueDate: string, teacherName: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const sendLoginVerificationEmail: (email: string, code: string) => Promise<{
    success: boolean;
    info: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    info?: undefined;
}>;
export declare const getTransporter: () => nodemailer.Transporter<any, nodemailer.TransportOptions>;
//# sourceMappingURL=email.d.ts.map