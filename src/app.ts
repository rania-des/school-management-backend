import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cron from 'node-cron';

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

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://school-frontend-wine.vercel.app ', 
    /\.vercel\.app$/,
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// ==================== ERROR HANDLING ====================

app.use(notFound);
app.use(errorHandler);


// Vérification des paiements en retard chaque jour à 9h
cron.schedule('0 9 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data: overduePayments } = await supabaseAdmin
    .from('payments')
    .select('*, students(id, profile_id, profiles(first_name, last_name))')
    .eq('status', 'pending')
    .lt('due_date', today);

  for (const payment of overduePayments || []) {
    await supabaseAdmin.from('payments').update({ status: 'overdue' }).eq('id', payment.id);
    // Notifier les parents
    const parentIds = await getStudentParentProfileIds(payment.student_id);
    for (const parentId of parentIds) {
      await supabaseAdmin.from('notifications').insert({
        recipient_id: parentId,
        type: 'payment',
        title: '💳 Paiement en retard',
        body: `Paiement de ${payment.amount} TND en retard pour ${payment.students?.profiles?.first_name}`,
        data: { paymentId: payment.id, amount: payment.amount },
      });
    }
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     School Management Platform API        ║
║     Running on port ${PORT}                  ║
║     Environment: ${process.env.NODE_ENV?.padEnd(16)}    ║
╚════════════════════════════════════════════╝
  `);
});

export default app;
