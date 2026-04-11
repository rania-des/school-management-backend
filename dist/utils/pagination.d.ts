import { Request } from 'express';
export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
export declare const PAGINATION: {
    DEFAULT_PAGE: number;
    DEFAULT_LIMIT: number;
    MAX_LIMIT: number;
};
export declare const getPagination: (req: Request) => PaginationParams;
export declare const paginate: <T>(data: T[], total: number, params: PaginationParams) => PaginatedResponse<T>;
export declare const successResponse: <T>(data: T, message?: string) => {
    success: boolean;
    message: string;
    data: T;
};
//# sourceMappingURL=pagination.d.ts.map