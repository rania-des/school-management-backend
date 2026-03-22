import { STORAGE_BUCKETS } from '../config/constants';
export declare const uploadFile: (bucket: string, file: Express.Multer.File, folder?: string) => Promise<string>;
export declare const deleteFile: (bucket: string, fileUrl: string) => Promise<void>;
export declare const getSignedUrl: (bucket: string, filePath: string, expiresIn?: number) => Promise<string>;
export { STORAGE_BUCKETS };
//# sourceMappingURL=storage.d.ts.map