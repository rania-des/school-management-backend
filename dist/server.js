"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const PORT = parseInt(process.env.PORT || '3000', 10);
// Démarrer le serveur uniquement ici
app_1.default.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🏫 School Management Platform API                      ║
║     🚀 Running on port ${PORT}                                  ║
║     🌍 Environment: ${process.env.NODE_ENV?.padEnd(16)}         ║
║     📡 API Base: /api/v1                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
//# sourceMappingURL=server.js.map