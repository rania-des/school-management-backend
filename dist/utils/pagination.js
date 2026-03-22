"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = exports.paginate = exports.getPagination = void 0;
const constants_1 = require("../config/constants");
const getPagination = (req) => {
    const page = Math.max(1, parseInt(req.query.page) || constants_1.PAGINATION.DEFAULT_PAGE);
    const limit = Math.min(constants_1.PAGINATION.MAX_LIMIT, parseInt(req.query.limit) || constants_1.PAGINATION.DEFAULT_LIMIT);
    const offset = (page - 1) * limit;
    return { page, limit, offset };
};
exports.getPagination = getPagination;
const paginate = (data, total, params) => {
    const totalPages = Math.ceil(total / params.limit);
    return {
        data,
        meta: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages,
            hasNext: params.page < totalPages,
            hasPrev: params.page > 1,
        },
    };
};
exports.paginate = paginate;
const successResponse = (data, message) => ({
    success: true,
    message,
    data,
});
exports.successResponse = successResponse;
//# sourceMappingURL=pagination.js.map