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
dotenv_1.default.config();
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
// Routes
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const grades_routes_1 = __importDefault(require("./modules/grades/grades.routes"));
const schedule_routes_1 = __importDefault(require("./modules/schedule/schedule.routes"));
const assignments_routes_1 = __importDefault(require("./modules/assignments/assignments.routes"));
const attendance_routes_1 = __importDefault(require("./modules/attendance/attendance.routes"));
const messages_routes_1 = __importDefault(require("./modules/messages/messages.routes"));
const notifications_routes_1 = __importDefault(require("./modules/notifications/notifications.routes"));
const announcements_routes_1 = __importDefault(require("./modules/announcements/announcements.routes"));
const payments_routes_1 = __importDefault(require("./modules/payments/payments.routes"));
const canteen_routes_1 = __importDefault(require("./modules/canteen/canteen.routes"));
const meetings_routes_1 = __importDefault(require("./modules/meetings/meetings.routes"));
const analytics_routes_1 = __importDefault(require("./modules/analytics/analytics.routes"));
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const teacher_routes_1 = __importDefault(require("./modules/teacher/teacher.routes"));
const parent_routes_1 = __importDefault(require("./modules/parent/parent.routes"));
const student_routes_1 = __importDefault(require("./modules/student/student.routes"));
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);
// ==================== MIDDLEWARE ====================
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        const allowed = [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://school-frontend-wine.vercel.app',
            'https://school-management-frontend.vercel.app',
            process.env.FRONTEND_URL,
        ].filter(Boolean);
        if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin) || /\.railway\.app$/.test(origin)) {
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
// Routes principales
app.use(`${API}/auth`, rateLimit_middleware_1.authRateLimit, auth_routes_1.default);
app.use(`${API}/users`, users_routes_1.default);
app.use(`${API}/grades`, grades_routes_1.default);
app.use(`${API}/schedule`, schedule_routes_1.default);
app.use(`${API}/assignments`, assignments_routes_1.default);
app.use(`${API}/attendance`, attendance_routes_1.default);
app.use(`${API}/messages`, messages_routes_1.default);
app.use(`${API}/notifications`, notifications_routes_1.default);
app.use(`${API}/announcements`, announcements_routes_1.default);
app.use(`${API}/payments`, payments_routes_1.default);
app.use(`${API}/canteen`, canteen_routes_1.default);
app.use(`${API}/meetings`, meetings_routes_1.default);
app.use(`${API}/analytics`, analytics_routes_1.default);
app.use(`${API}/admin`, admin_routes_1.default);
// Routes spécifiques par rôle
app.use(`${API}/teacher`, teacher_routes_1.default);
app.use(`${API}/parents`, parent_routes_1.default);
app.use(`${API}/students`, student_routes_1.default);
// Route de test pour vérifier que l'API fonctionne
app.get(`${API}/ping`, (_req, res) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});
// ==================== ERROR HANDLING ====================
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
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
exports.default = app;
//# sourceMappingURL=app.js.map