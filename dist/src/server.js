"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
console.log('🚀 === SERVER STARTING WITH DEBUG === 🚀');
console.log('🔵 Node version:', process.version);
console.log('🔵 Environment:', process.env.NODE_ENV);
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