import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
import teacherRoutes from './modules/teacher/teacher.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import studentRoutes from './modules/student/student.routes.js';
import parentRoutes from './modules/parent/parent.routes.js';
import scheduleRoutes from './modules/schedule/schedule.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import assignmentsRoutes from './modules/assignments/assignments.routes.js';
import announcementsRoutes from './modules/announcements/announcements.routes.js';
import gradesRoutes from './modules/grades/grades.routes.js';
import messagesRoutes from './modules/messages/messages.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import meetingsRoutes from './modules/meetings/meetings.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import usersRoutes from './modules/users/users.routes.js';

// Routes
app.use('/api/v1/teacher', teacherRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/student', studentRoutes);
app.use('/api/v1/parent', parentRoutes);
app.use('/api/v1/schedule', scheduleRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/assignments', assignmentsRoutes);
app.use('/api/v1/announcements', announcementsRoutes);
app.use('/api/v1/grades', gradesRoutes);
app.use('/api/v1/messages', messagesRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/meetings', meetingsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/users', usersRoutes);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
});