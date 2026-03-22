export declare const sendPasswordResetEmail: (email: string, resetLink: string) => Promise<void>;
export declare const sendWelcomeEmail: (email: string, firstName: string, role: string) => Promise<void>;
export declare const sendMeetingNotification: (email: string, firstName: string, meetingDate: string, teacherName: string) => Promise<void>;
export declare const sendAbsenceNotification: (email: string, parentName: string, studentName: string, date: string) => Promise<void>;
//# sourceMappingURL=email.d.ts.map