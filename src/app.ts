import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import { globalRateLimit, authRateLimit } from './middleware/rateLimit.middleware';
import { errorHandler, notFound } from './middleware/error.middleware';

// Routes
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import gradesRoutes from './modules/grades/grades.routes';
import scheduleRoutes from './modules/schedule/schedule.routes';
import assignmentsRoutes from './modules/assignments/assignments.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import messagesRoutes from './modules/messages/messages.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import announcementsRoutes from './modules/announcements/announcements.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import canteenRoutes from './modules/canteen/canteen.routes';
import meetingsRoutes from './modules/meetings/meetings.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import adminRoutes from './modules/admin/admin.routes';
import teacherRoutes from './modules/teacher/teacher.routes';
import parentRoutes from './modules/parent/parent.routes';
import studentRoutes from './modules/student/student.routes';

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

// ==================== MIDDLEWARE ====================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://school-frontend-wine.vercel.app',
      'https://school-management-frontend.vercel.app',
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[];

    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin) || /\.railway\.app$/.test(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimit);

// ==================== HEALTH CHECK ====================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ==================== API ROUTES ====================

const API = '/api/v1';

// Routes principales
app.use(`${API}/auth`, authRateLimit, authRoutes);
app.use(`${API}/users`, usersRoutes);
app.use(`${API}/grades`, gradesRoutes);
app.use(`${API}/schedule`, scheduleRoutes);
app.use(`${API}/assignments`, assignmentsRoutes);
app.use(`${API}/attendance`, attendanceRoutes);
app.use(`${API}/messages`, messagesRoutes);
app.use(`${API}/notifications`, notificationsRoutes);
app.use(`${API}/announcements`, announcementsRoutes);
app.use(`${API}/payments`, paymentsRoutes);
app.use(`${API}/canteen`, canteenRoutes);
app.use(`${API}/meetings`, meetingsRoutes);
app.use(`${API}/analytics`, analyticsRoutes);
app.use(`${API}/admin`, adminRoutes);

// Routes spécifiques par rôle
app.use(`${API}/teacher`, teacherRoutes);
app.use(`${API}/parents`, parentRoutes);
app.use(`${API}/students`, studentRoutes);

// Route de test pour vérifier que l'API fonctionne
app.get(`${API}/ping`, (_req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// ==================== ERROR HANDLING ====================

app.use(notFound);
app.use(errorHandler);

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🏫 School Management Platform API                      ║
║     🚀 Running on port ${PORT}                                  ║
║     🌍 Environment: ${process.env.NODE_ENV?.padEnd(16)}         ║
║     📡 API Base: ${API}                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;