import { supabaseAdmin, supabasePublic } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { sendWelcomeEmail } from '../../utils/email';

export class AuthService {

  async login(email: string, password: string) {
    console.log('🔵 === LOGIN ATTEMPT ===');
    console.log('🔵 Email:', email);
    console.log('🔵 Using supabasePublic for login');

    // UTILISER supabasePublic (ANON_KEY) PAS supabaseAdmin
    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    console.log('🔵 Error from Supabase:', error?.message || 'No error');
    console.log('🔵 Session exists:', !!data.session);

    if (error || !data.session) {
      console.log('🔴 Login failed:', error?.message);
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    console.log('🔵 User ID:', data.user.id);

    // Pour lire le profil, on utilise supabaseAdmin (SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

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

  // ... le reste du code reste identique
}

export const authService = new AuthService();