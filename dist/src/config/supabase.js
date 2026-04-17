"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabasePublic = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
exports.supabasePublic = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
// Client admin pour les opérations admin (createUser, lire profiles, etc.)
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
console.log('✅ Supabase clients initialisés avec succès');
//# sourceMappingURL=supabase.js.map