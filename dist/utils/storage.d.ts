export declare const STORAGE_BUCKETS: {
    AVATARS: string;
    ASSIGNMENTS: string;
    SUBMISSIONS: string;
    DOCUMENTS: string;
    RECEIPTS: string;
};
export declare const uploadFile: (bucket: string, file: Express.Multer.File, folder?: string) => Promise<string>;
export declare const deleteFile: (bucket: string, fileUrl: string) => Promise<boolean>;
export declare const getSignedUrl: (bucket: string, filePath: string, expiresIn?: number) => Promise<string | null>;
export declare const checkBucketExists: (bucket: string) => Promise<boolean>;
export declare const ensureBucketExists: (bucket: string, isPublic?: boolean) => Promise<boolean>;
//# sourceMappingURL=storage.d.ts.map