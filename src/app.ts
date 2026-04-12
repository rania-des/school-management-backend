import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import { globalRateLimit, authRateLimit } from './middleware/rateLimit.middleware';
import { errorHandler, notFound } from './middleware/error.middleware';

// Routes
import authRoutes         from './modules/auth/auth.routes';
import teacherRoutes      from './modules/teacher/teacher.routes';
import studentRoutes      from './modules/student/student.routes';
import parentRoutes       from './modules/parent/parent.routes';
import adminRoutes        from './modules/admin/admin.routes';
import gradesRoutes       from './modules/grades/grades.routes';
import assignmentsRoutes  from './modules/assignments/assignments.routes';
import attendanceRoutes   from './modules/attendance/attendance.routes';
import scheduleRoutes     from './modules/schedule/schedule.routes';
import messagesRoutes     from './modules/messages/messages.routes';
import announcementsRoutes from './modules/announcements/announcements.routes';
import paymentsRoutes     from './modules/payments/payments.routes';
import canteenRoutes      from './modules/canteen/canteen.routes';
import meetingsRoutes     from './modules/meetings/meetings.routes';
import usersRoutes        from './modules/users/users.routes';
import analyticsRoutes    from './modules/analytics/analytics.routes';
import dbRoutes           from './routes/db.routes';

const app = express();
app.set('trust proxy', 1);

// ==================== MIDDLEWARE ====================

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[];

    if (
      !origin ||
      allowed.includes(origin) ||
      /\.vercel\.app$/.test(origin) ||
      /\.railway\.app$/.test(origin)
    ) {
      callback(null, true);
    } else {
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

app.use(`${API}/auth`,          authRateLimit, authRoutes);
app.use(`${API}/teacher`,       teacherRoutes);
app.use(`${API}/student`,       studentRoutes);
app.use(`${API}/parent`,        parentRoutes);
app.use(`${API}/admin`,         adminRoutes);
app.use(`${API}/grades`,        gradesRoutes);
app.use(`${API}/assignments`,   assignmentsRoutes);
app.use(`${API}/attendance`,    attendanceRoutes);
app.use(`${API}/schedule`,      scheduleRoutes);
app.use(`${API}/messages`,      messagesRoutes);
app.use(`${API}/announcements`, announcementsRoutes);
app.use(`${API}/payments`,      paymentsRoutes);
app.use(`${API}/canteen`,       canteenRoutes);
app.use(`${API}/meetings`,      meetingsRoutes);
app.use(`${API}/users`,         usersRoutes);
app.use(`${API}/analytics`,     analyticsRoutes);
app.use(`${API}/db`,            dbRoutes);

app.get(`${API}/ping`, (_req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// ==================== ERROR HANDLING ====================

app.use(notFound);
app.use(errorHandler);

export default app;