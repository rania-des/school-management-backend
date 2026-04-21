"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
console.log('🚀 === SERVER STARTING ===');
console.log('🔵 Node version:', process.version);
console.log('🔵 Environment:', process.env.NODE_ENV);
console.log('🔵 SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ ' + process.env.SUPABASE_URL : '❌ MANQUANT');
console.log('🔵 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ ' + process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...' : '❌ MANQUANT');
console.log('🔵 SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ ' + process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...' : '❌ MANQUANT');
const app_1 = __importDefault(require("./app"));
const PORT = parseInt(process.env.PORT || '3000', 10);
app_1.default.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🏫 School Management Platform API                      ║
║     🚀 Running on port ${PORT}                                  ║
║     🌍 Environment: ${(process.env.NODE_ENV ?? 'development').padEnd(16)}         ║
║     📡 API Base: /api/v1                                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
//# sourceMappingURL=server.js.map