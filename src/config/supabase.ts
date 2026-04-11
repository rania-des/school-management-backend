import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔑 SUPABASE_URL:', supabaseUrl ? '✅ OK' : '❌ MANQUANT');
console.log('🔑 SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ OK' : '❌ MANQUANT');
console.log('🔑 SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ OK' : '❌ MANQUANT');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error(
    `Variables Supabase manquantes:\n` +
    `SUPABASE_URL: ${supabaseUrl ? 'OK' : 'MANQUANT'}\n` +
    `SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'OK' : 'MANQUANT'}\n` +
    `SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'OK' : 'MANQUANT'}`
  );
}

// Client public pour l'authentification (signIn, signUp)
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

// Client admin pour les opérations admin (createUser, profiles, etc.)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log('✅ Supabase clients créés avec succès');