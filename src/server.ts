console.log('🚀 === SERVER STARTING WITH DEBUG === 🚀');
console.log('🔵 Node version:', process.version);
console.log('🔵 Environment:', process.env.NODE_ENV);

import app from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
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