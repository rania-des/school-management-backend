import app from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Démarrer le serveur uniquement ici
app.listen(PORT, '0.0.0.0', () => {
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