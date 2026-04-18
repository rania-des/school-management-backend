"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const email_1 = require("../../utils/email");
class AuthService {
    async login(email, password) {
        const { data, error } = await supabase_1.supabaseAdmin.auth.signInWithPassword({ email, password });
        if (error || !data.session)
            throw new error_middleware_1.AppError('Email ou mot de passe incorrect', 401);
        const { data: profile } = await supabase_1.supabaseAdmin
            .from('users').select('*').eq('id', data.user.id).single();
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
        // ✅ Vérification explicite : email déjà utilisé ?
        const { data: existingProfile } = await supabase_1.supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', payload.email.toLowerCase())
            .maybeSingle();
        if (existingProfile) {
            throw new error_middleware_1.AppError('Cette adresse email est déjà utilisée', 409);
        }
        const { data, error } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email: payload.email, password: payload.password, email_confirm: true,
            user_metadata: {
                first_name: payload.firstName,
                last_name: payload.lastName,
            },
        });
        if (error || !data.user) {
            if (error?.message.includes('already') || error?.message.includes('registered'))
                throw new error_middleware_1.AppError('Cette adresse email est déjà utilisée', 409);
            throw new error_middleware_1.AppError('Échec de la création du compte', 400);
        }
        const userId = data.user.id;
        const { error: profileError } = await supabase_1.supabaseAdmin.from('users').insert({
            id: userId, role: payload.role,
            first_name: payload.firstName, last_name: payload.lastName,
            email: payload.email,
            gender: payload.gender, phone: payload.phone, date_of_birth: payload.dateOfBirth,
        });
        if (profileError) {
            await supabase_1.supabaseAdmin.auth.admin.deleteUser(userId);
            throw new error_middleware_1.AppError(`Échec de la création du profil: ${profileError.message}`, 500);
        }
        await this.createRoleRecord(userId, payload.role);
        const roleId = await this.getRoleId(userId, payload.role);
        (0, email_1.sendWelcomeEmail)(payload.email, payload.firstName, payload.role).catch(console.error);
        return { message: 'Compte créé avec succès', userId, roleId };
    }
    async createRoleRecord(profileId, role) {
        if (role === 'student') {
            const studentNumber = `STU-${Date.now()}`;
            const { error } = await supabase_1.supabaseAdmin.from('students').insert({
                profile_id: profileId,
                student_number: studentNumber,
                enrollment_date: new Date().toISOString().split('T')[0],
            });
            if (error)
                console.error('❌ Error creating student record:', error.message, error.code);
            else
                console.log('✅ Student record created for', profileId);
        }
        else if (role === 'teacher') {
            const employeeNumber = `TCH-${Date.now()}`;
            const { error } = await supabase_1.supabaseAdmin.from('teachers').insert({
                profile_id: profileId,
                employee_number: employeeNumber,
                hire_date: new Date().toISOString().split('T')[0],
            });
            if (error)
                console.error('❌ Error creating teacher record:', error.message, error.code);
            else
                console.log('✅ Teacher record created for', profileId);
        }
        else if (role === 'parent') {
            const { error } = await supabase_1.supabaseAdmin.from('parents').insert({ profile_id: profileId });
            if (error)
                console.error('❌ Error creating parent record:', error.message, error.code);
            else
                console.log('✅ Parent record created for', profileId);
        }
    }
    async getRoleId(profileId, role) {
        if (role === 'student') {
            const { data } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', profileId).single();
            return data?.id || null;
        }
        else if (role === 'teacher') {
            const { data } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', profileId).single();
            return data?.id || null;
        }
        else if (role === 'parent') {
            const { data } = await supabase_1.supabaseAdmin
                .from('parents').select('id').eq('profile_id', profileId).single();
            return data?.id || null;
        }
        return null;
    }
    async refreshToken(refreshToken) {
        const { data, error } = await supabase_1.supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
        if (error || !data.session)
            throw new error_middleware_1.AppError('Token de rafraîchissement invalide', 401);
        return {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
        };
    }
    async logout(userId) {
        await supabase_1.supabaseAdmin.auth.admin.signOut(userId);
        return { message: 'Déconnexion réussie' };
    }
    async forgotPassword(email) {
        const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
        const { error } = await supabase_1.supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
        if (error)
            throw new error_middleware_1.AppError('Échec de l\'envoi de l\'email de réinitialisation', 500);
        return { message: 'Email de réinitialisation envoyé' };
    }
    async updatePassword(userId, newPassword) {
        const { error } = await supabase_1.supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
        if (error)
            throw new error_middleware_1.AppError('Échec de la mise à jour du mot de passe', 500);
        return { message: 'Mot de passe mis à jour avec succès' };
    }
    async getMe(userId) {
        const { data: profile, error } = await supabase_1.supabaseAdmin
            .from('users').select('*').eq('id', userId).single();
        if (error || !profile)
            throw new error_middleware_1.AppError('Profil non trouvé', 404);
        let roleData = null;
        let roleId = null;
        if (profile.role === 'student') {
            const { data } = await supabase_1.supabaseAdmin
                .from('students')
                .select('*, classes(name, levels(name)), parent_student(*, parents(*, users(first_name, last_name, email, phone)))')
                .eq('profile_id', userId).single();
            roleData = data;
            roleId = data?.id;
        }
        else if (profile.role === 'teacher') {
            const { data } = await supabase_1.supabaseAdmin
                .from('teachers').select('*').eq('profile_id', userId).single();
            roleData = data;
            roleId = data?.id;
        }
        else if (profile.role === 'parent') {
            const { data } = await supabase_1.supabaseAdmin
                .from('parents')
                .select('*, parent_student(*, students(*, users(first_name, last_name), classes(name)))')
                .eq('profile_id', userId).single();
            roleData = data;
            roleId = data?.id;
        }
        return {
            id: profile.id, email: profile.email,
            role: profile.role, firstName: profile.first_name, lastName: profile.last_name,
            gender: profile.gender, phone: profile.phone, address: profile.address,
            avatarUrl: profile.avatar_url, dateOfBirth: profile.date_of_birth,
            roleId, roleData,
        };
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map