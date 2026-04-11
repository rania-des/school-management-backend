import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== Supabase Config Debug ===');
console.log('SUPABASE_URL exists:', !!supabaseUrl);
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!supabaseServiceKey);
console.log('SUPABASE_SERVICE_ROLE_KEY length:', supabaseServiceKey?.length);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

// Admin client (bypasse les RLS) — utiliser uniquement côté serveur
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log('✅ Supabase admin client initialized');