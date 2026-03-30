import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';

export class AuthService {
  async login(email: string, password: string) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new AppError('Invalid email or password', 401);

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', data.user.id).single();

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

  async register(payload: {
    email: string; password: string; firstName: string; lastName: string;
    role: string; gender?: string; phone?: string; dateOfBirth?: string;
  }) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email, password: payload.password, email_confirm: true,
    });

    if (error || !data.user) {
      if (error?.message.includes('already registered'))
        throw new AppError('Email already in use', 409);
      throw new AppError(`Failed to create user: ${error?.message}`, 400);
    }

    const userId = data.user.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId, role: payload.role,
      first_name: payload.firstName, last_name: payload.lastName,
      gender: payload.gender, phone: payload.phone, date_of_birth: payload.dateOfBirth,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new AppError('Failed to create profile', 500);
    }

    await this.createRoleRecord(userId, payload.role);

    // ✅ Fetch roleId AFTER insert (bypass RLS with supabaseAdmin)
    const roleId = await this.getRoleId(userId, payload.role);

    sendWelcomeEmail(payload.email, payload.firstName, payload.role).catch(console.error);

    return { message: 'Account created successfully', userId, roleId };
  }

  private async createRoleRecord(profileId: string, role: string): Promise<void> {
    if (role === 'student') {
      const studentNumber = `STU-${Date.now()}`;
      const { error } = await supabaseAdmin.from('students').insert({
        profile_id: profileId,
        student_number: studentNumber,
        enrollment_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating student record:', error.message, error.code);
      else console.log('✅ Student record created for', profileId);
    } else if (role === 'teacher') {
      const employeeNumber = `TCH-${Date.now()}`;
      const { error } = await supabaseAdmin.from('teachers').insert({
        profile_id: profileId,
        employee_number: employeeNumber,
        hire_date: new Date().toISOString().split('T')[0],
      });
      if (error) console.error('❌ Error creating teacher record:', error.message, error.code);
      else console.log('✅ Teacher record created for', profileId);
    } else if (role === 'parent') {
      const { error } = await supabaseAdmin.from('parents').insert({ profile_id: profileId });
      if (error) console.error('❌ Error creating parent record:', error.message, error.code);
      else console.log('✅ Parent record created for', profileId);
    }
  }

  // ✅ Fetch the role-specific ID after insert
  private async getRoleId(profileId: string, role: string): Promise<string | null> {
    if (role === 'student') {
      const { data } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', profileId).single();
      return data?.id || null;
    } else if (role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', profileId).single();
      return data?.id || null;
    } else if (role === 'parent') {
      const { data } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', profileId).single();
      return data?.id || null;
    }
    return null;
  }

  async refreshToken(refreshToken: string) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new AppError('Invalid refresh token', 401);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  async logout(userId: string) {
    await supabaseAdmin.auth.admin.signOut(userId);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const redirectUrl = `${process.env.FRONTEND_URL}/reset-password`;
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (error) throw new AppError('Failed to send reset email', 500);
    return { message: 'Password reset email sent' };
  }

  async updatePassword(userId: string, newPassword: string) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AppError('Failed to update password', 500);
    return { message: 'Password updated successfully' };
  }

  async getMe(userId: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single();
    if (error || !profile) throw new AppError('Profile not found', 404);

    let roleData = null;
    let roleId = null;

    if (profile.role === 'student') {
      const { data } = await supabaseAdmin
        .from('students')
        .select('*, classes(name, levels(name)), parent_student(*, parents(*, profiles(first_name, last_name, email, phone)))')
        .eq('profile_id', userId).single();
      roleData = data; roleId = data?.id;
    } else if (profile.role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers').select('*').eq('profile_id', userId).single();
      roleData = data; roleId = data?.id;
    } else if (profile.role === 'parent') {
      const { data } = await supabaseAdmin
        .from('parents')
        .select('*, parent_student(*, students(*, profiles(first_name, last_name), classes(name)))')
        .eq('profile_id', userId).single();
      roleData = data; roleId = data?.id;
    }

    return {
      id: profile.id, email: profile.email || profile.id,
      role: profile.role, firstName: profile.first_name, lastName: profile.last_name,
      gender: profile.gender, phone: profile.phone, address: profile.address,
      avatarUrl: profile.avatar_url, dateOfBirth: profile.date_of_birth,
      roleId, roleData,
    };
  }
}

export const authService = new AuthService();
