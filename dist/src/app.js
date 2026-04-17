"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
console.log('🔵 === APP.TS LOADING ===');
dotenv_1.default.config();
console.log('🔵 SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Defined' : '❌ Missing');
console.log('🔵 SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Defined' : '❌ Missing');
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
// Routes
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const teacher_routes_1 = __importDefault(require("./modules/teacher/teacher.routes"));
const app = (0, express_1.default)();
app.set('trust proxy', 1);
// ==================== MIDDLEWARE ====================
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        const allowed = [
            'http://localhost:5173',
            'http://localhost:3000',
            process.env.FRONTEND_URL,
        ].filter(Boolean);
        if (!origin ||
            allowed.includes(origin) ||
            /\.vercel\.app$/.test(origin) ||
            /\.railway\.app$/.test(origin)) {
            callback(null, true);
        }
        else {
            console.log('CORS blocked origin:', origin);
            callback(null, true);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
}));
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(rateLimit_middleware_1.globalRateLimit);
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
console.log('🔵 Mounting routes at:', API);
app.use(`${API}/auth`, rateLimit_middleware_1.authRateLimit, auth_routes_1.default);
app.use(`${API}/teacher`, teacher_routes_1.default);
console.log('🔵 Routes mounted:');
console.log('   - POST /api/v1/auth/login');
console.log('   - GET /api/v1/teacher/classes');
app.get(`${API}/ping`, (_req, res) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});
// ==================== ERROR HANDLING ====================
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
console.log('🔵 === APP.TS LOADED SUCCESSFULLY ===');
exports.default = app;
//# sourceMappingURL=app.js.map