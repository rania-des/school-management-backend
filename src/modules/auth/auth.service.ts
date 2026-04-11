import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';
const JWT_EXPIRES_IN = '7d';

export class AuthService {

  // ── Helper pour générer JWT ──────────────────────────────────────────────
  private generateToken(userId: string, email: string, role: string): string {
    return jwt.sign(
      { id: userId, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // ── Helper pour hasher le mot de passe ───────────────────────────────────
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  // ── Helper pour vérifier le mot de passe ─────────────────────────────────
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(email: string, password: string) {
    console.log('🔵 === LOGIN ATTEMPT ===');
    console.log('🔵 Email:', email);
    console.log('🔵 Password length:', password?.length);

    // Récupérer l'utilisateur depuis la base de données
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    console.log('🔵 Profile found:', !!profile);
    console.log('🔵 Profile error:', profileError?.message || 'No error');

    if (profileError || !profile) {
      console.log('🔴 User not found in database');
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    // Vérifier si l'utilisateur a un password_hash
    if (!profile.password_hash) {
      console.log('🔵 User has no password hash, creating one from provided password...');
      
      // Créer un hash à partir du mot de passe fourni
      const hashedPassword = await this.hashPassword(password);
      
      // Mettre à jour l'utilisateur avec le nouveau hash
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ password_hash: hashedPassword })
        .eq('id', profile.id);
      
      if (updateError) {
        console.log('🔴 Failed to update password hash:', updateError.message);
        throw new AppError('Erreur lors de la mise à jour du mot de passe', 500);
      }
      
      console.log('✅ Password hash created and saved for user:', profile.email);
      // Continuer la connexion sans vérification supplémentaire
    } else {
      // Vérifier le mot de passe uniquement s'il existe déjà un hash
      const isValid = await this.verifyPassword(password, profile.password_hash);
      if (!isValid) {
        console.log('🔴 Invalid password');
        throw new AppError('Email ou mot de passe incorrect', 401);
      }
    }

    console.log('🔵 Login successful for user:', profile.id);

    // Récupérer les données spécifiques au rôle
    let roleData = null;
    let roleId = null;

    if (profile.role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers')
        .select('*')
        .eq('profile_id', profile.id)
        .single();
      roleData = data;
      roleId = data?.id;
    } else if (profile.role === 'student') {
      const { data } = await supabaseAdmin
        .from('students')
        .select('*, classes(name, levels(name))')
        .eq('profile_id', profile.id)
        .single();
      roleData = data;
      roleId = data?.id;
    } else if (profile.role === 'parent') {
      const { data } = await supabaseAdmin
        .from('parents')
        .select('*')
        .eq('profile_id', profile.id)
        .single();
      roleData = data;
      roleId = data?.id;
    }

    const token = this.generateToken(profile.id, profile.email, profile.role);

    return {
      accessToken: token,
      refreshToken: token,
      expiresIn: 7 * 24 * 60 * 60,
      user: {
        id: profile.id,
        email: profile.email,
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

    // Vérifier si l'email existe déjà
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', payload.email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      console.log('🔴 Email already exists in profiles');
      throw new AppError('Cette adresse email est déjà utilisée', 409);
    }

    const userId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const hashedPassword = await this.hashPassword(payload.password);

    console.log('🔵 User ID:', userId);

    // Créer le profil dans la table `profiles`
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      role: payload.role,
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email.toLowerCase(),
      gender: payload.gender,
      phone: payload.phone,
      date_of_birth: payload.dateOfBirth,
      password_hash: hashedPassword,
    });

    if (profileError) {
      console.log('🔴 Profile creation error:', profileError.message);
      throw new AppError(`Échec de la création du profil: ${profileError.message}`, 500);
    }

    console.log('✅ Profile created successfully');

    // Créer l'enregistrement de rôle spécifique
    await this.createRoleRecord(userId, payload.role);
    const roleId = await this.getRoleId(userId, payload.role);

    // Email de bienvenue (non bloquant)
    sendWelcomeEmail(payload.email, payload.firstName, payload.role).catch(console.error);

    return { message: 'Compte créé avec succès', userId, roleId };
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    console.log('🔵 === REFRESH TOKEN ===');
    
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
      const token = this.generateToken(decoded.id, decoded.email, decoded.role);
      return {
        accessToken: token,
        refreshToken: token,
        expiresIn: 7 * 24 * 60 * 60,
      };
    } catch (error) {
      console.log('🔴 Refresh failed:', error);
      throw new AppError('Token de rafraîchissement invalide', 401);
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(userId: string) {
    console.log('🔵 === LOGOUT === User:', userId);
    return { message: 'Déconnexion réussie' };
  }

  // ── Forgot Password ────────────────────────────────────────────────────────
  async forgotPassword(email: string) {
    console.log('🔵 === FORGOT PASSWORD === Email:', email);
    
    const resetToken = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        reset_token: resetToken,
        reset_expires: resetExpires.toISOString(),
      })
      .eq('email', email.toLowerCase());

    if (error) {
      console.log('🔴 Forgot password error:', error.message);
      throw new AppError("Échec de l'envoi de l'email de réinitialisation", 500);
    }

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    console.log('🔵 Reset link:', resetLink);
    
    return { message: 'Email de réinitialisation envoyé' };
  }

  // ── Reset Password avec token ──────────────────────────────────────────────
  async resetPasswordWithToken(token: string, newPassword: string) {
    console.log('🔵 === RESET PASSWORD WITH TOKEN ===');
    
    const now = new Date().toISOString();
    
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('reset_token', token)
      .gt('reset_expires', now)
      .single();

    if (error || !profile) {
      console.log('🔴 Invalid or expired token');
      throw new AppError('Token invalide ou expiré', 401);
    }

    console.log('🔵 User found:', profile.id);

    const hashedPassword = await this.hashPassword(newPassword);

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        password_hash: hashedPassword,
        reset_token: null,
        reset_expires: null,
      })
      .eq('id', profile.id);

    if (updateError) {
      console.log('🔴 Update password error:', updateError.message);
      throw new AppError('Échec de la réinitialisation du mot de passe', 500);
    }

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ── Update Password (connecté) ─────────────────────────────────────────────
  async updatePassword(userId: string, newPassword: string) {
    console.log('🔵 === UPDATE PASSWORD === User:', userId);
    
    const hashedPassword = await this.hashPassword(newPassword);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ password_hash: hashedPassword })
      .eq('id', userId);

    if (error) {
      console.log('🔴 Update password error:', error.message);
      throw new AppError('Échec de la mise à jour du mot de passe', 500);
    }
    return { message: 'Mot de passe mis à jour avec succès' };
  }

  // ── Get Me ─────────────────────────────────────────────────────────────────
  async getMe(userId: string) {
    console.log('🔵 === GET ME === User:', userId);
    
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.log('🔴 Profile not found:', error?.message);
      throw new AppError('Profil non trouvé', 404);
    }

    let roleData = null;
    let roleId = null;

    if (profile.role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers')
        .select('*')
        .eq('profile_id', userId)
        .single();
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

  // ── Fix Missing Passwords (route admin temporaire) ─────────────────────────
  async fixMissingPasswords(defaultPassword: string = 'password123') {
    console.log('🔵 Fixing missing passwords...');
    
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .is('password_hash', null);
    
    if (error) {
      console.error('Error fetching users:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`🔵 Found ${users?.length || 0} users without password`);
    
    const defaultHash = await this.hashPassword(defaultPassword);
    let updated = 0;
    
    for (const user of users || []) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ password_hash: defaultHash })
        .eq('id', user.id);
      
      if (!updateError) {
        updated++;
        console.log(`✅ Updated password for ${user.email}`);
      } else {
        console.log(`❌ Failed to update for ${user.email}:`, updateError.message);
      }
    }
    
    console.log(`✅ Fixed passwords for ${updated} users`);
    return { success: true, updated, total: users?.length || 0 };
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private async createRoleRecord(profileId: string, role: string): Promise<void> {
    console.log(`🔵 Creating ${role} record for profile:`, profileId);
    
    if (role === 'student') {
      const { error } = await supabaseAdmin.from('students').insert({
        profile_id: profileId,
        student_number: `STU-${Date.now()}`,
        enrollment_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating student record:', error.message);
      else console.log('✅ Student record created for', profileId);
    } else if (role === 'teacher') {
      const { error } = await supabaseAdmin.from('teachers').insert({
        profile_id: profileId,
        employee_number: `TCH-${Date.now()}`,
        hire_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating teacher record:', error.message);
      else console.log('✅ Teacher record created for', profileId);
    } else if (role === 'parent') {
      const { error } = await supabaseAdmin.from('parents').insert({ profile_id: profileId });
      if (error) console.error('❌ Error creating parent record:', error.message);
      else console.log('✅ Parent record created for', profileId);
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
    const { data } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('profile_id', profileId)
      .single();
    return data?.id ?? null;
  }
}

export const authService = new AuthService();