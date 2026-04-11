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
import teacherRoutes from './modules/teacher/teacher.routes';

const app = express();
app.set('trust proxy', 1);

// ==================== MIDDLEWARE ====================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

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
      console.log('CORS blocked origin:', origin);
      callback(null, true); // permissif en prod, restreindre si besoin
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

app.use(`${API}/auth`, authRateLimit, authRoutes);
app.use(`${API}/teacher`, teacherRoutes);

app.get(`${API}/ping`, (_req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// ==================== ERROR HANDLING ====================

app.use(notFound);
app.use(errorHandler);

export default app;