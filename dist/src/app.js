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
const pdf_routes_1 = __importDefault(require("./modules/pdf/pdf.routes"));
dotenv_1.default.config();
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
// Routes
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const teacher_routes_1 = __importDefault(require("./modules/teacher/teacher.routes"));
const student_routes_1 = __importDefault(require("./modules/student/student.routes"));
const parent_routes_1 = __importDefault(require("./modules/parent/parent.routes"));
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const grades_routes_1 = __importDefault(require("./modules/grades/grades.routes"));
const assignments_routes_1 = __importDefault(require("./modules/assignments/assignments.routes"));
const attendance_routes_1 = __importDefault(require("./modules/attendance/attendance.routes"));
const schedule_routes_1 = __importDefault(require("./modules/schedule/schedule.routes"));
const messages_routes_1 = __importDefault(require("./modules/messages/messages.routes"));
const announcements_routes_1 = __importDefault(require("./modules/announcements/announcements.routes"));
const payments_routes_1 = __importDefault(require("./modules/payments/payments.routes"));
const canteen_routes_1 = __importDefault(require("./modules/canteen/canteen.routes"));
const meetings_routes_1 = __importDefault(require("./modules/meetings/meetings.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const analytics_routes_1 = __importDefault(require("./modules/analytics/analytics.routes"));
const db_routes_1 = __importDefault(require("./routes/db.routes"));
const download_routes_1 = __importDefault(require("./modules/student/download.routes"));
// ✅ NEW — AI prediction module
const ai_routes_1 = __importDefault(require("./modules/ai/ai.routes"));
const app = (0, express_1.default)();
app.set('trust proxy', 1);
// ==================== MIDDLEWARE ====================
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
            callback(null, true);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
}));
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// ✅ CORRECTION: Augmentation de la limite JSON à 50mb
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
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
app.use(`${API}/auth`, rateLimit_middleware_1.authRateLimit, auth_routes_1.default);
app.use(`${API}/teacher`, teacher_routes_1.default);
app.use(`${API}/student`, student_routes_1.default);
app.use(`${API}/parent`, parent_routes_1.default);
app.use(`${API}/admin`, admin_routes_1.default);
app.use(`${API}/grades`, grades_routes_1.default);
app.use(`${API}/assignments`, assignments_routes_1.default);
app.use(`${API}/attendance`, attendance_routes_1.default);
app.use(`${API}/schedule`, schedule_routes_1.default);
app.use(`${API}/messages`, messages_routes_1.default);
app.use(`${API}/announcements`, announcements_routes_1.default);
app.use(`${API}/news`, announcements_routes_1.default); // alias -> announcements
app.use(`${API}/payments`, payments_routes_1.default);
app.use(`${API}/canteen`, canteen_routes_1.default);
app.use(`${API}/meetings`, meetings_routes_1.default);
app.use(`${API}/users`, users_routes_1.default);
app.use(`${API}/analytics`, analytics_routes_1.default);
app.use(`${API}/db`, db_routes_1.default);
app.use(`${API}/pdf`, pdf_routes_1.default);
// ✅ NEW — AI routes (predict, evaluate)
app.use(`${API}/ai`, ai_routes_1.default);
// ✅ Route de téléchargement sécurisé pour les fichiers des étudiants
app.use(`${API}/student`, download_routes_1.default);
app.get(`${API}/ping`, (_req, res) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});
// ==================== ERROR HANDLING ====================
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map