console.log('🔥🔥🔥 AUTH SERVICE V8 (with 2FA) 🔥🔥🔥');

import { createClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

console.log('🔑 AUTH SERVICE - ANON:', SUPABASE_ANON_KEY ? '✅ ' + SUPABASE_ANON_KEY.substring(0, 15) + '...' : '❌');
console.log('🔑 AUTH SERVICE - SERVICE:', SUPABASE_SERVICE_KEY ? '✅ ' + SUPABASE_SERVICE_KEY.substring(0, 15) + '...' : '❌');

// Public client — signInWithPassword works for ALL users regardless of key format
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client — for admin operations only (createUser, deleteUser, updateUser)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Fetch profile using the user's own access token.
 * Uses anon key + user JWT — bypasses service_role key issues entirely.
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
    const err = await res.json() as unknown;
    console.log('🔴 Profile fetch error:', JSON.stringify(err));
    return null;
  }

  const data = await res.json() as unknown[];
  const profile = Array.isArray(data) ? data[0] ?? null : null;
  console.log('🔵 Profile found:', !!profile);
  return profile as Record<string, unknown> | null;
}

export class AuthService {

  // ==================== LOGIN AVEC SUPPORT 2FA ====================
  async login(email: string, password: string) {
    console.log('🔵 === LOGIN ATTEMPT ===');
    console.log('🔵 Email:', email);

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    console.log('🔵 Auth error:', error?.message || 'aucun');
    console.log('🔵 Session:', !!data?.session);

    if (error || !data?.session) {
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    const userId = data.user.id;
    const accessToken = data.session.access_token;

    const profile = await fetchProfile(userId, accessToken);

    if (!profile) {
      throw new AppError('Profil introuvable', 404);
    }

    if (profile['is_active'] === false) {
      throw new AppError('Compte désactivé. Veuillez contacter l\'administrateur.', 403);
    }

    const twoFactorEnabled = profile['two_factor_enabled'] === true;

    // Si 2FA activée, on ne retourne pas les tokens, mais un challengeId
    if (twoFactorEnabled) {
      const challengeId = await this.createLoginChallenge(userId, email, profile['role'] as string);
      return {
        requires2FA: true,
        challengeId,
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

    // Sinon, retour normal
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

  // ==================== 2FA : GÉNÉRATION SECRET & QR CODE ====================
  async generate2FASecret(userId: string, email: string) {
    const secret = speakeasy.generateSecret({
      name: `OMNIA:${email}`,
      length: 20,
    });
    // Stockage temporaire en base (en attendant activation)
    await supabaseAdmin
      .from('profiles')
      .update({ two_factor_secret: secret.base32 })
      .eq('id', userId);
    
    const otpauthUrl = secret.otpauth_url;
    const qrCode = await QRCode.toDataURL(otpauthUrl!);
    return { secret: secret.base32, qrCode };
  }

  // ==================== 2FA : ACTIVATION APRÈS VÉRIFICATION ====================
  async activate2FA(userId: string, token: string) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('two_factor_secret')
      .eq('id', userId)
      .single();
    
    if (!profile?.two_factor_secret) {
      throw new AppError('Aucun secret trouvé. Générez d\'abord un secret.', 400);
    }
    
    const verified = speakeasy.totp.verify({
      secret: profile.two_factor_secret,
      encoding: 'base32',
      token,
      window: 1,
    });
    
    if (!verified) {
      throw new AppError('Code invalide', 400);
    }
    
    // Activer définitivement
    await supabaseAdmin
      .from('profiles')
      .update({ two_factor_enabled: true })
      .eq('id', userId);
    
    // Générer 10 codes de récupération
    const backupCodes = await this.generateBackupCodes(userId);
    return { backupCodes };
  }

  private async generateBackupCodes(userId: string): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase(); // 8 caractères
      const hashed = createHash('sha256').update(code).digest('hex');
      await supabaseAdmin.from('backup_codes').insert({
        user_id: userId,
        code_hash: hashed,
      });
      codes.push(code);
    }
    return codes;
  }

  // ==================== 2FA : VÉRIFICATION GÉNÉRIQUE (TOTP + back-up) ====================
  async verify2FACode(userId: string, token: string): Promise<boolean> {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('two_factor_secret')
      .eq('id', userId)
      .single();
    
    if (!profile?.two_factor_secret) return false;
    
    // Vérifier TOTP
    const valid = speakeasy.totp.verify({
      secret: profile.two_factor_secret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (valid) return true;
    
    // Sinon, vérifier les codes de récupération
    const hash = createHash('sha256').update(token).digest('hex');
    const { data: backup } = await supabaseAdmin
      .from('backup_codes')
      .select('id')
      .eq('user_id', userId)
      .eq('code_hash', hash)
      .eq('used', false)
      .single();
    
    if (backup) {
      await supabaseAdmin
        .from('backup_codes')
        .update({ used: true })
        .eq('id', backup.id);
      return true;
    }
    return false;
  }

  // ==================== 2FA : DÉSACTIVATION ====================
  async disable2FA(userId: string, token: string) {
    const isValid = await this.verify2FACode(userId, token);
    if (!isValid) throw new AppError('Code invalide', 400);
    
    await supabaseAdmin
      .from('profiles')
      .update({ two_factor_enabled: false, two_factor_secret: null })
      .eq('id', userId);
    
    // Supprimer les codes de récupération
    await supabaseAdmin
      .from('backup_codes')
      .delete()
      .eq('user_id', userId);
    
    return { message: '2FA désactivée' };
  }

  // ==================== GESTION DES CHALLENGES DE CONNEXION ====================
  async createLoginChallenge(userId: string, email: string, role: string): Promise<string> {
    const challengeId = randomBytes(16).toString('hex');
    const challengeData = { userId, email, role };
    await supabaseAdmin.from('login_challenges').insert({
      id: challengeId,
      user_id: userId,
      challenge_data: challengeData,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    return challengeId;
  }

  async getLoginChallenge(challengeId: string) {
    const { data, error } = await supabaseAdmin
      .from('login_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();
    if (error || !data || new Date(data.expires_at) < new Date()) {
      return null;
    }
    return data;
  }

  async deleteLoginChallenge(challengeId: string) {
    await supabaseAdmin.from('login_challenges').delete().eq('id', challengeId);
  }

  // ==================== FINALISATION CONNEXION APRÈS 2FA ====================
  
  async complete2FALogin(challengeId: string, token: string) {
    const challenge = await this.getLoginChallenge(challengeId);
    if (!challenge) throw new AppError('Session expirée, reconnectez-vous', 401);
    const userId = challenge.challenge_data.userId;
    const isValid = await this.verify2FACode(userId, token);
    if (!isValid) throw new AppError('Code invalide', 401);
    const { accessToken, refreshToken } = this.issueTokens(userId);
  
    // Récupérer le profil utilisateur
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, first_name, last_name, avatar_url')
      .eq('id', userId)
      .single();
    
    await this.deleteLoginChallenge(challengeId);
    return { accessToken, refreshToken, user: profile };
  }

  // ==================== ÉMISSION DE TOKENS JWT (pour remplacer Supabase après 2FA) ====================
  private issueTokens(userId: string) {
    const accessToken = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  // ==================== REGISTER (inchangé) ====================
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

  // ==================== REFRESH TOKEN (inchangé) ====================
  async refreshToken(refreshToken: string) {
    const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new AppError('Token de rafraîchissement invalide', 401);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  // ==================== LOGOUT ====================
  async logout(userId: string) {
    await supabaseAdmin.auth.admin.signOut(userId);
    return { message: 'Déconnexion réussie' };
  }

  // ==================== FORGOT PASSWORD ====================
  async forgotPassword(email: string) {
    const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
    const { error } = await supabasePublic.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (error) throw new AppError("Échec de l'envoi de l'email de réinitialisation", 500);
    return { message: 'Email de réinitialisation envoyé' };
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    const { data, error } = await supabasePublic.auth.getUser(token);
    if (error || !data.user) throw new AppError('Token invalide ou expiré', 401);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (updateError) throw new AppError('Échec de la réinitialisation du mot de passe', 500);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ==================== UPDATE PASSWORD (avec vérification de l'ancien) ====================
  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) {
      throw new AppError('Utilisateur introuvable', 404);
    }

    const { error: signInError } = await supabasePublic.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });

    if (signInError) {
      throw new AppError('Mot de passe actuel incorrect', 401);
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AppError('Échec de la mise à jour du mot de passe', 500);
    return { message: 'Mot de passe mis à jour avec succès' };
  }

  // ==================== GET ME (profil) ====================
  async getMe(userId: string, accessToken: string) {
    const profile = await fetchProfile(userId, accessToken);
    if (!profile) throw new AppError('Profil non trouvé', 404);

    let roleData = null;
    let roleId = null;

    try {
      if (profile['role'] === 'teacher') {
        const { data } = await supabaseAdmin.from('teachers').select('*').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      } else if (profile['role'] === 'student') {
        const { data } = await supabaseAdmin.from('students').select('*, classes(name, levels(name))').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      } else if (profile['role'] === 'parent') {
        const { data } = await supabaseAdmin.from('parents').select('*, parent_student(*, students(*, profiles(first_name, last_name), classes(name)))').eq('profile_id', userId).single();
        roleData = data; roleId = data?.id;
      }
    } catch (e) {
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
      twoFactorEnabled: profile['two_factor_enabled'] === true,
      roleId,
      roleData,
    };
  }

  // ==================== HELPERS (création des enregistrements rôles) ====================
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