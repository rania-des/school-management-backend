"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
console.log('🔥🔥🔥 AUTH SERVICE V6 🔥🔥🔥');
const supabase_js_1 = require("@supabase/supabase-js");
const error_middleware_1 = require("../../middleware/error.middleware");
const email_1 = require("../../utils/email");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('🔑 AUTH SERVICE - ANON:', SUPABASE_ANON_KEY ? '✅ ' + SUPABASE_ANON_KEY.substring(0, 15) + '...' : '❌');
console.log('🔑 AUTH SERVICE - SERVICE:', SUPABASE_SERVICE_KEY ? '✅ ' + SUPABASE_SERVICE_KEY.substring(0, 15) + '...' : '❌');
// Public client — signInWithPassword works for ALL users regardless of key format
const supabasePublic = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
// Admin client — for admin operations only (createUser, deleteUser, updateUser)
const supabaseAdmin = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
/**
 * Fetch profile using the user's own access token.
 * Uses anon key + user JWT — bypasses service_role key issues entirely.
 */
async function fetchProfile(userId, accessToken) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });
    console.log('🔵 Profile fetch status:', res.status);
    if (!res.ok) {
        const err = await res.json();
        console.log('🔴 Profile fetch error:', JSON.stringify(err));
        return null;
    }
    const data = await res.json();
    const profile = Array.isArray(data) ? data[0] ?? null : null;
    console.log('🔵 Profile found:', !!profile);
    return profile;
}
class AuthService {
    async login(email, password) {
        console.log('🔵 === LOGIN ATTEMPT ===');
        console.log('🔵 Email:', email);
        // Use SDK signInWithPassword — works for ALL users, same as original
        const { data, error } = await supabasePublic.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
        });
        console.log('🔵 Auth error:', error?.message || 'aucun');
        console.log('🔵 Session:', !!data?.session);
        if (error || !data?.session) {
            throw new error_middleware_1.AppError('Email ou mot de passe incorrect', 401);
        }
        const userId = data.user.id;
        const accessToken = data.session.access_token;
        console.log('🔵 User ID:', userId);
        // Fetch profile using user's own token — bypasses service_role key issues
        const profile = await fetchProfile(userId, accessToken);
        if (!profile) {
            console.log('🔴 No profile found for user:', userId);
            throw new error_middleware_1.AppError('Profil introuvable', 404);
        }
        console.log('✅ Login successful! Role:', profile['role']);
        return {
            accessToken,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
            user: {
                id: userId,
                email: data.user.email,
                role: profile['role'],
                firstName: profile['first_name'],
                lastName: profile['last_name'],
                avatarUrl: profile['avatar_url'],
            },
        };
    }
    async register(payload) {
        console.log('🔵 === REGISTER ATTEMPT ===');
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: payload.email.trim().toLowerCase(),
            password: payload.password,
            email_confirm: true,
            user_metadata: { first_name: payload.firstName, last_name: payload.lastName },
        });
        if (error || !data.user) {
            if (error?.message?.includes('already') || error?.message?.includes('registered')) {
                throw new error_middleware_1.AppError('Cette adresse email est déjà utilisée', 409);
            }
            throw new error_middleware_1.AppError(`Échec de la création du compte: ${error?.message}`, 400);
        }
        const userId = data.user.id;
        const { error: profileError } = await supabaseAdmin.from('profiles').insert({
            id: userId,
            role: payload.role,
            first_name: payload.firstName,
            last_name: payload.lastName,
            email: payload.email.trim().toLowerCase(),
            gender: payload.gender ?? null,
            phone: payload.phone ?? null,
            date_of_birth: payload.dateOfBirth ?? null,
        });
        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
            throw new error_middleware_1.AppError(`Échec de la création du profil: ${profileError.message}`, 500);
        }
        await this.createRoleRecord(userId, payload.role);
        const roleId = await this.getRoleId(userId, payload.role);
        (0, email_1.sendWelcomeEmail)(payload.email, payload.firstName, payload.role).catch(console.error);
        return { message: 'Compte créé avec succès', userId, roleId };
    }
    async refreshToken(refreshToken) {
        const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
        if (error || !data.session)
            throw new error_middleware_1.AppError('Token de rafraîchissement invalide', 401);
        return {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresIn: data.session.expires_in,
        };
    }
    async logout(userId) {
        await supabaseAdmin.auth.admin.signOut(userId);
        return { message: 'Déconnexion réussie' };
    }
    async forgotPassword(email) {
        const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
        const { error } = await supabasePublic.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
        if (error)
            throw new error_middleware_1.AppError("Échec de l'envoi de l'email de réinitialisation", 500);
        return { message: 'Email de réinitialisation envoyé' };
    }
    async resetPasswordWithToken(token, newPassword) {
        const { data, error } = await supabasePublic.auth.getUser(token);
        if (error || !data.user)
            throw new error_middleware_1.AppError('Token invalide ou expiré', 401);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: newPassword });
        if (updateError)
            throw new error_middleware_1.AppError('Échec de la réinitialisation du mot de passe', 500);
        return { message: 'Mot de passe réinitialisé avec succès' };
    }
    async updatePassword(userId, newPassword) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
        if (error)
            throw new error_middleware_1.AppError('Échec de la mise à jour du mot de passe', 500);
        return { message: 'Mot de passe mis à jour avec succès' };
    }
    async getMe(userId, accessToken) {
        const profile = await fetchProfile(userId, accessToken);
        if (!profile)
            throw new error_middleware_1.AppError('Profil non trouvé', 404);
        let roleData = null;
        let roleId = null;
        try {
            if (profile['role'] === 'teacher') {
                const { data } = await supabaseAdmin.from('teachers').select('*').eq('profile_id', userId).single();
                roleData = data;
                roleId = data?.id;
            }
            else if (profile['role'] === 'student') {
                const { data } = await supabaseAdmin.from('students').select('*, classes(name, levels(name))').eq('profile_id', userId).single();
                roleData = data;
                roleId = data?.id;
            }
            else if (profile['role'] === 'parent') {
                const { data } = await supabaseAdmin.from('parents').select('*, parent_student(*, students(*, profiles(first_name, last_name), classes(name)))').eq('profile_id', userId).single();
                roleData = data;
                roleId = data?.id;
            }
        }
        catch (e) {
            console.log('⚠️ Role record not found for', profile['role'], '- non-fatal');
        }
        return {
            id: profile['id'],
            email: profile['email'],
            role: profile['role'],
            firstName: profile['first_name'],
            lastName: profile['last_name'],
            gender: profile['gender'],
            phone: profile['phone'],
            address: profile['address'],
            avatarUrl: profile['avatar_url'],
            dateOfBirth: profile['date_of_birth'],
            roleId,
            roleData,
        };
    }
    async createRoleRecord(profileId, role) {
        if (role === 'student') {
            const { error } = await supabaseAdmin.from('students').insert({
                profile_id: profileId,
                student_number: `STU-${Date.now()}`,
                enrollment_date: new Date().toISOString().split('T')[0],
            });
            if (error)
                console.error('❌ Error creating student record:', error.message);
        }
        else if (role === 'teacher') {
            const { error } = await supabaseAdmin.from('teachers').insert({
                profile_id: profileId,
                employee_number: `TCH-${Date.now()}`,
                hire_date: new Date().toISOString().split('T')[0],
            });
            if (error)
                console.error('❌ Error creating teacher record:', error.message);
        }
        else if (role === 'parent') {
            const { error } = await supabaseAdmin.from('parents').insert({ profile_id: profileId });
            if (error)
                console.error('❌ Error creating parent record:', error.message);
        }
    }
    async getRoleId(profileId, role) {
        const tableMap = { student: 'students', teacher: 'teachers', parent: 'parents' };
        const table = tableMap[role];
        if (!table)
            return null;
        const { data } = await supabaseAdmin.from(table).select('id').eq('profile_id', profileId).single();
        return data?.id ?? null;
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map