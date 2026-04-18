import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log de diagnostic au démarrage
console.log('🔑 SUPABASE_URL:', supabaseUrl ? '✅ OK' : '❌ MANQUANT');
console.log('🔑 SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ OK' : '❌ MANQUANT');
console.log('🔑 SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ OK' : '❌ MANQUANT');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseAnonKey && 'SUPABASE_ANON_KEY',
    !supabaseServiceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean).join(', ');
  throw new Error(`❌ Variables Supabase manquantes dans Railway: ${missing}`);
}

// Client public pour l'authentification (signInWithPassword, signUp)
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

// Client admin pour les opérations admin (createUser, lire profiles, etc.)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log('✅ Supabase clients initialisés avec succès');