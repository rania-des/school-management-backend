"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_BUCKETS = exports.getSignedUrl = exports.deleteFile = exports.uploadFile = void 0;
const supabase_1 = require("../config/supabase");
const constants_1 = require("../config/constants");
Object.defineProperty(exports, "STORAGE_BUCKETS", { enumerable: true, get: function () { return constants_1.STORAGE_BUCKETS; } });
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const uploadFile = async (bucket, file, folder) => {
    const ext = path_1.default.extname(file.originalname);
    const filename = `${folder ? folder + '/' : ''}${(0, uuid_1.v4)()}${ext}`;
    const { error } = await supabase_1.supabaseAdmin.storage
        .from(bucket)
        .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
    });
    if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
    }
    const { data } = supabase_1.supabaseAdmin.storage.from(bucket).getPublicUrl(filename);
    return data.publicUrl;
};
exports.uploadFile = uploadFile;
const deleteFile = async (bucket, fileUrl) => {
    const urlParts = fileUrl.split(`${bucket}/`);
    if (urlParts.length < 2)
        return;
    const filePath = urlParts[1];
    const { error } = await supabase_1.supabaseAdmin.storage.from(bucket).remove([filePath]);
    if (error) {
        console.error('Failed to delete file:', error);
    }
};
exports.deleteFile = deleteFile;
const getSignedUrl = async (bucket, filePath, expiresIn = 3600) => {
    const { data, error } = await supabase_1.supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);
    if (error || !data) {
        throw new Error('Failed to generate signed URL');
    }
    return data.signedUrl;
};
exports.getSignedUrl = getSignedUrl;
//# sourceMappingURL=storage.js.map