export declare class AuthService {
    login(email: string, password: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string | undefined;
            role: any;
            firstName: any;
            lastName: any;
            avatarUrl: any;
        };
    }>;
    register(payload: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role: string;
        gender?: string;
        phone?: string;
        dateOfBirth?: string;
    }): Promise<{
        message: string;
        userId: string;
        roleId: string | null;
    }>;
    refreshToken(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>;
    logout(userId: string): Promise<{
        message: string;
    }>;
    forgotPassword(email: string): Promise<{
        message: string;
    }>;
    resetPasswordWithToken(token: string, newPassword: string): Promise<{
        message: string;
    }>;
    updatePassword(userId: string, newPassword: string): Promise<{
        message: string;
    }>;
    getMe(userId: string): Promise<{
        id: any;
        email: any;
        role: any;
        firstName: any;
        lastName: any;
        gender: any;
        phone: any;
        address: any;
        avatarUrl: any;
        dateOfBirth: any;
        roleId: any;
        roleData: any;
    }>;
    private createRoleRecord;
    private getRoleId;
}
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map