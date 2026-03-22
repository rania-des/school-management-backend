"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const email_1 = require("../../utils/email");
class AuthService {
    async login(email, password) {
        const { data, error } = await supabase_1.supabaseAdmin.auth.signInWithPassword({
            email,
            password,
        });
        if (error || !data.session) {
            throw new error_middleware_1.AppError('Invalid email or password', 401);
        }
        // Fetch full profile
        const { data: profile } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        return {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
            user: {
                id: data.user.id,
                email: data.user.email,
                role: profile?.role,
                firstName: profile?.first_name,
                lastName: profile?.last_name,
                avatarUrl: profile?.avatar_url,
            },
        };
    }
    async register(payload) {
        // Create auth user
        const { data, error } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email: payload.email,
            password: payload.password,
            email_confirm: true,
        });
        if (error || !data.user) {
            if (error?.message.includes('already registered')) {
                throw new error_middleware_1.AppError('Email already in use', 409);
            }
            throw new error_middleware_1.AppError(`Failed to create user: ${error?.message}`, 400);
        }
        const userId = data.user.id;
        // Create profile
        const { error: profileError } = await supabase_1.supabaseAdmin.from('profiles').insert({
            id: userId,
            role: payload.role,
            first_name: payload.firstName,
            last_name: payload.lastName,
            gender: payload.gender,
            phone: payload.phone,
            date_of_birth: payload.dateOfBirth,
        });
        if (profileError) {
            // Rollback auth user
            await supabase_1.supabaseAdmin.auth.admin.deleteUser(userId);
            throw new error_middleware_1.AppError('Failed to create profile', 500);
        }
        // Create role-specific record
        await this.createRoleRecord(userId, payload.role);
        // Send welcome email
        (0, email_1.sendWelcomeEmail)(payload.email, payload.firstName, payload.role).catch(console.error);
        return { message: 'Account created successfully', userId };
    }
    async createRoleRecord(profileId, role) {
        if (role === 'student') {
            const studentNumber = `STU-${Date.now()}`;
            await supabase_1.supabaseAdmin.from('students').insert({
                profile_id: profileId,
                student_number: studentNumber,
                enrollment_date: new Date().toISOString().split('T')[0],
            });
        }
        else if (role === 'teacher') {
            const employeeNumber = `TCH-${Date.now()}`;
            await supabase_1.supabaseAdmin.from('teachers').insert({
                profile_id: profileId,
                employee_number: employeeNumber,
                hire_date: new Date().toISOString().split('T')[0],
            });
        }
        else if (role === 'parent') {
            await supabase_1.supabaseAdmin.from('parents').insert({ profile_id: profileId });
        }
    }
    async refreshToken(refreshToken) {
        const { data, error } = await supabase_1.supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
        if (error || !data.session) {
            throw new error_middleware_1.AppError('Invalid refresh token', 401);
        }
        return {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
        };
    }
    async logout(userId) {
        await supabase_1.supabaseAdmin.auth.admin.signOut(userId);
        return { message: 'Logged out successfully' };
    }
    async forgotPassword(email) {
        const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
        const { error } = await supabase_1.supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });
        if (error) {
            throw new error_middleware_1.AppError('Failed to send reset email', 500);
        }
        return { message: 'Password reset email sent' };
    }
    async updatePassword(userId, newPassword) {
        const { error } = await supabase_1.supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword,
        });
        if (error) {
            throw new error_middleware_1.AppError('Failed to update password', 500);
        }
        return { message: 'Password updated successfully' };
    }
    async getMe(userId) {
        const { data: profile, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error || !profile) {
            throw new error_middleware_1.AppError('Profile not found', 404);
        }
        // Get role-specific data
        let roleData = null;
        if (profile.role === 'student') {
            const { data } = await supabase_1.supabaseAdmin
                .from('students')
                .select('*, classes(name, levels(name))')
                .eq('profile_id', userId)
                .single();
            roleData = data;
        }
        else if (profile.role === 'teacher') {
            const { data } = await supabase_1.supabaseAdmin
                .from('teachers')
                .select('*')
                .eq('profile_id', userId)
                .single();
            roleData = data;
        }
        else if (profile.role === 'parent') {
            const { data } = await supabase_1.supabaseAdmin
                .from('parents')
                .select('*, parent_student(students(*, profiles(first_name, last_name)))')
                .eq('profile_id', userId)
                .single();
            roleData = data;
        }
        return {
            id: profile.id,
            email: profile.id,
            role: profile.role,
            firstName: profile.first_name,
            lastName: profile.last_name,
            gender: profile.gender,
            phone: profile.phone,
            address: profile.address,
            avatarUrl: profile.avatar_url,
            dateOfBirth: profile.date_of_birth,
            roleData,
        };
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map