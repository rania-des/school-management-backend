console.log('🔥🔥🔥 AUTH SERVICE CHARGÉ 🔥🔥🔥');

import { supabaseAdmin, supabasePublic } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';

export class AuthService {

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(email: string, password: string) {
    console.log('🔵 === LOGIN ATTEMPT ===');
    console.log('🔵 Email:', email);

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    console.log('🔵 Supabase auth error:', error?.message || 'aucun');
    console.log('🔵 Session:', !!data.session);
    console.log('🔵 User:', !!data.user);

    if (error || !data.session) {
      console.log('🔴 Login failed:', error?.message);
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    console.log('🔵 Profile found:', !!profile);
    console.log('🔵 Profile error:', profileError?.message || 'aucun');

    if (profileError || !profile) {
      throw new AppError('Profil introuvable', 404);
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile.role,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url,
      },
    };
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    gender?: string;
    phone?: string;
    dateOfBirth?: string;
  }) {
    console.log('🔵 === REGISTER ATTEMPT ===');
    console.log('🔵 Email:', payload.email);
    console.log('🔵 Role:', payload.role);

    // Vérifier si l'email existe déjà dans profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', payload.email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      throw new AppError('Cette adresse email est déjà utilisée', 409);
    }

    // Créer l'utilisateur via admin API (email déjà confirmé)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        first_name: payload.firstName,
        last_name: payload.lastName,
      },
    });

    console.log('🔵 Auth user created:', !!data.user);
    console.log('🔵 Auth error:', error?.message || 'aucun');

    if (error || !data.user) {
      if (error?.message?.includes('already') || error?.message?.includes('registered')) {
        throw new AppError('Cette adresse email est déjà utilisée', 409);
      }
      console.log('🔴 createUser failed:', error?.message);
      throw new AppError(`Échec de la création du compte: ${error?.message}`, 400);
    }

    const userId = data.user.id;
    console.log('🔵 User ID:', userId);

    // Créer le profil
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
      console.log('🔴 Profile error:', profileError.message);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new AppError(`Échec de la création du profil: ${profileError.message}`, 500);
    }

    console.log('✅ Profile created');

    await this.createRoleRecord(userId, payload.role);
    const roleId = await this.getRoleId(userId, payload.role);

    sendWelcomeEmail(payload.email, payload.firstName, payload.role).catch(console.error);

    return { message: 'Compte créé avec succès', userId, roleId };
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw new AppError('Token de rafraîchissement invalide', 401);
    }
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(userId: string) {
    await supabaseAdmin.auth.admin.signOut(userId);
    return { message: 'Déconnexion réussie' };
  }

  // ── Forgot Password ────────────────────────────────────────────────────────
  async forgotPassword(email: string) {
    const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
    const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) throw new AppError("Échec de l'envoi de l'email de réinitialisation", 500);
    return { message: 'Email de réinitialisation envoyé' };
  }

  // ── Reset Password ─────────────────────────────────────────────────────────
  async resetPasswordWithToken(token: string, newPassword: string) {
    const { data, error } = await supabasePublic.auth.getUser(token);
    if (error || !data.user) throw new AppError('Token invalide ou expiré', 401);

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      password: newPassword,
    });
    if (updateError) throw new AppError('Échec de la réinitialisation du mot de passe', 500);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ── Update Password ────────────────────────────────────────────────────────
  async updatePassword(userId: string, newPassword: string) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw new AppError('Échec de la mise à jour du mot de passe', 500);
    return { message: 'Mot de passe mis à jour avec succès' };
  }

  // ── Get Me ─────────────────────────────────────────────────────────────────
  async getMe(userId: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new AppError('Profil non trouvé', 404);

    let roleData = null;
    let roleId = null;

    if (profile.role === 'teacher') {
      const { data } = await supabaseAdmin.from('teachers').select('*').eq('profile_id', userId).single();
      roleData = data;
      roleId = data?.id;
    } else if (profile.role === 'student') {
      const { data } = await supabaseAdmin
        .from('students')
        .select('*, classes(name, levels(name))')
        .eq('profile_id', userId)
        .single();
      roleData = data;
      roleId = data?.id;
    } else if (profile.role === 'parent') {
      const { data } = await supabaseAdmin
        .from('parents')
        .select('*, parent_student(*, students(*, profiles(first_name, last_name), classes(name)))')
        .eq('profile_id', userId)
        .single();
      roleData = data;
      roleId = data?.id;
    }

    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
      gender: profile.gender,
      phone: profile.phone,
      address: profile.address,
      avatarUrl: profile.avatar_url,
      dateOfBirth: profile.date_of_birth,
      roleId,
      roleData,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private async createRoleRecord(profileId: string, role: string): Promise<void> {
    if (role === 'student') {
      const { error } = await supabaseAdmin.from('students').insert({
        profile_id: profileId,
        student_number: `STU-${Date.now()}`,
        enrollment_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating student record:', error.message);
    } else if (role === 'teacher') {
      const { error } = await supabaseAdmin.from('teachers').insert({
        profile_id: profileId,
        employee_number: `TCH-${Date.now()}`,
        hire_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating teacher record:', error.message);
    } else if (role === 'parent') {
      const { error } = await supabaseAdmin.from('parents').insert({ profile_id: profileId });
      if (error) console.error('❌ Error creating parent record:', error.message);
    }
  }

  private async getRoleId(profileId: string, role: string): Promise<string | null> {
    const tableMap: Record<string, string> = {
      student: 'students',
      teacher: 'teachers',
      parent: 'parents',
    };
    const table = tableMap[role];
    if (!table) return null;
    const { data } = await supabaseAdmin.from(table).select('id').eq('profile_id', profileId).single();
    return data?.id ?? null;
  }
}

export const authService = new AuthService();