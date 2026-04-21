export declare class AuthService {
    login(email: string, password: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string | undefined;
            role: string;
            firstName: string;
            lastName: string;
            avatarUrl: string;
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
    getMe(userId: string, accessToken: string): Promise<{
        id: string;
        email: string;
        role: string;
        firstName: string;
        lastName: string;
        gender: string;
        phone: string;
        address: string;
        avatarUrl: string;
        dateOfBirth: string;
        roleId: any;
        roleData: any;
    }>;
    private createRoleRecord;
    private getRoleId;
}
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map