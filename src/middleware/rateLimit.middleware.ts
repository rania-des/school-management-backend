// APRÈS
import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 500,       // 10 000 en dev, 500 en prod
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,              // désactivé totalement en dev
  message: { error: 'Too many requests, please try again later' },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 20,         // 1 000 en dev, 20 en prod
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,              // désactivé totalement en dev
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts, please try again later' },
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 1000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: { error: 'Upload limit reached, please try again later' },
});

export const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isDev ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: { error: 'Too many requests, please slow down' },
});