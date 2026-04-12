console.log('🔥🔥🔥 AUTH SERVICE V5 🔥🔥🔥');

import { createClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('🔑 AUTH SERVICE - ANON:', SUPABASE_ANON_KEY ? '✅ ' + SUPABASE_ANON_KEY.substring(0, 15) + '...' : '❌');
console.log('🔑 AUTH SERVICE - SERVICE:', SUPABASE_SERVICE_KEY ? '✅ ' + SUPABASE_SERVICE_KEY.substring(0, 15) + '...' : '❌');

// Admin client — used only for admin operations (createUser, deleteUser, updateUser)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Fetch profile using the user's own access token.
 * This works regardless of which Supabase key format is in use (legacy JWT or new sb_* keys).
 */
async function fetchProfile(userId: string, accessToken: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('🔵 Profile fetch status:', res.status);

  if (!res.ok) {
    const err = await res.json();
    console.log('🔴 Profile fetch error:', JSON.stringify(err));
    return null;
  }

  const data = await res.json();
  const profile = Array.isArray(data) ? data[0] ?? null : null;
  console.log('🔵 Profile found:', !!profile, profile ? `role=${profile.role}` : '');
  return profile;
}

export class AuthService {

  async login(email: string, password: string) {
    console.log('🔵 === LOGIN ATTEMPT ===');
    console.log('🔵 Email:', email);

    // Step 1: Authenticate with Supabase
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    console.log('🔵 Auth status:', res.status);

    if (!res.ok) {
      console.log('🔴 Auth failed');
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    const session = await res.json();

    if (!session?.access_token || !session?.user?.id) {
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    const userId = session.user.id;
    const accessToken = session.access_token;
    console.log('🔵 User ID:', userId);

    // Step 2: Fetch profile using user's own token
    const profile = await fetchProfile(userId, accessToken);

    if (!profile) {
      console.log('🔴 No profile found for user:', userId);
      throw new AppError('Profil introuvable', 404);
    }

    console.log('✅ Login successful! Role:', profile.role);

    return {
      accessToken,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      user: {
        id: userId,
        email: session.user.email,
        role: profile.role,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url,
      },
    };
  }

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

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      email_confirm: true,
      user_metadata: { first_name: payload.firstName, last_name: payload.lastName },
    });

    if (error || !data.user) {
      if (error?.message?.includes('already') || error?.message?.includes('registered')) {
        throw new AppError('Cette adresse email est déjà utilisée', 409);
      }
      throw new AppError(`Échec de la création du compte: ${error?.message}`, 400);
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
      throw new AppError(`Échec de la création du profil: ${profileError.message}`, 500);
    }

    await this.createRoleRecord(userId, payload.role);
    const roleId = await this.getRoleId(userId, payload.role);
    sendWelcomeEmail(payload.email, payload.firstName, payload.role).catch(console.error);

    return { message: 'Compte créé avec succès', userId, roleId };
  }

  async refreshToken(refreshToken: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) throw new AppError('Token de rafraîchissement invalide', 401);

    const session = await res.json();
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
    };
  }

  async logout(userId: string) {
    await supabaseAdmin.auth.admin.signOut(userId);
    return { message: 'Déconnexion réussie' };
  }

  async forgotPassword(email: string) {
    const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, gotrue_meta_security: {}, redirect_to: redirectUrl }),
    });
    if (!res.ok) throw new AppError("Échec de l'envoi de l'email de réinitialisation", 500);
    return { message: 'Email de réinitialisation envoyé' };
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new AppError('Token invalide ou expiré', 401);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (updateError) throw new AppError('Échec de la réinitialisation du mot de passe', 500);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async updatePassword(userId: string, newPassword: string) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AppError('Échec de la mise à jour du mot de passe', 500);
    return { message: 'Mot de passe mis à jour avec succès' };
  }

  async getMe(userId: string, accessToken: string) {
    const profile = await fetchProfile(userId, accessToken);
    if (!profile) throw new AppError('Profil non trouvé', 404);

    let roleData = null;
    let roleId = null;

    try {
      if (profile.role === 'teacher') {
        const { data } = await supabaseAdmin.from('teachers').select('*').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      } else if (profile.role === 'student') {
        const { data } = await supabaseAdmin.from('students').select('*, classes(name, levels(name))').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      } else if (profile.role === 'parent') {
        const { data } = await supabaseAdmin.from('parents').select('*, parent_student(*, students(*, profiles(first_name, last_name), classes(name)))').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      }
    } catch (e) {
      // Role record may not exist for manually created users — not a fatal error
      console.log('⚠️ Role record not found for', profile.role, '- non-fatal');
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
    const tableMap: Record<string, string> = { student: 'students', teacher: 'teachers', parent: 'parents' };
    const table = tableMap[role];
    if (!table) return null;
    const { data } = await supabaseAdmin.from(table).select('id').eq('profile_id', profileId).single();
    return data?.id ?? null;
  }
}

export const authService = new AuthService();