"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBucketExists = exports.checkBucketExists = exports.getSignedUrl = exports.deleteFile = exports.uploadFile = exports.STORAGE_BUCKETS = void 0;
const supabase_1 = require("../config/supabase");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
// Buckets constants
exports.STORAGE_BUCKETS = {
    AVATARS: 'avatars',
    ASSIGNMENTS: 'assignments',
    SUBMISSIONS: 'submissions',
    DOCUMENTS: 'documents',
    RECEIPTS: 'receipts',
};
const uploadFile = async (bucket, file, folder) => {
    const ext = path_1.default.extname(file.originalname);
    const safeFileName = `${(0, uuid_1.v4)()}${ext}`;
    const filePath = folder ? `${folder}/${safeFileName}` : safeFileName;
    const { error } = await supabase_1.supabaseAdmin.storage
        .from(bucket)
        .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
    });
    if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
    }
    const { data } = supabase_1.supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
};
exports.uploadFile = uploadFile;
const deleteFile = async (bucket, fileUrl) => {
    try {
        // Extraire le chemin du fichier depuis l'URL
        const urlParts = fileUrl.split(`${bucket}/`);
        if (urlParts.length < 2) {
            console.warn('Cannot extract file path from URL:', fileUrl);
            return false;
        }
        const filePath = urlParts[1];
        const { error } = await supabase_1.supabaseAdmin.storage.from(bucket).remove([filePath]);
        if (error) {
            console.error('Failed to delete file:', error);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Delete file error:', error);
        return false;
    }
};
exports.deleteFile = deleteFile;
const getSignedUrl = async (bucket, filePath, expiresIn = 3600) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin.storage
            .from(bucket)
            .createSignedUrl(filePath, expiresIn);
        if (error || !data) {
            console.error('Failed to generate signed URL:', error);
            return null;
        }
        return data.signedUrl;
    }
    catch (error) {
        console.error('Signed URL error:', error);
        return null;
    }
};
exports.getSignedUrl = getSignedUrl;
// Vérifier si un bucket existe
const checkBucketExists = async (bucket) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin.storage.getBucket(bucket);
        if (error)
            return false;
        return !!data;
    }
    catch {
        return false;
    }
};
exports.checkBucketExists = checkBucketExists;
// Créer un bucket s'il n'existe pas
const ensureBucketExists = async (bucket, isPublic = true) => {
    try {
        const exists = await (0, exports.checkBucketExists)(bucket);
        if (exists)
            return true;
        const { error } = await supabase_1.supabaseAdmin.storage.createBucket(bucket, {
            public: isPublic,
            fileSizeLimit: 10485760, // 10MB
        });
        if (error) {
            console.error(`Failed to create bucket ${bucket}:`, error);
            return false;
        }
        console.log(`✅ Bucket created: ${bucket}`);
        return true;
    }
    catch (error) {
        console.error(`Error ensuring bucket ${bucket}:`, error);
        return false;
    }
};
exports.ensureBucketExists = ensureBucketExists;
//# sourceMappingURL=storage.js.map