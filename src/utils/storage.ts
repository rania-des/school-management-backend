import { supabaseAdmin } from '../config/supabase';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Buckets constants
export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  DOCUMENTS: 'documents',
  RECEIPTS: 'receipts',
};

export const uploadFile = async (
  bucket: string,
  file: Express.Multer.File,
  folder?: string
): Promise<string> => {
  const ext = path.extname(file.originalname);
  const safeFileName = `${uuidv4()}${ext}`;
  const filePath = folder ? `${folder}/${safeFileName}` : safeFileName;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
};

export const deleteFile = async (bucket: string, fileUrl: string): Promise<boolean> => {
  try {
    // Extraire le chemin du fichier depuis l'URL
    const urlParts = fileUrl.split(`${bucket}/`);
    if (urlParts.length < 2) {
      console.warn('Cannot extract file path from URL:', fileUrl);
      return false;
    }

    const filePath = urlParts[1];
    const { error } = await supabaseAdmin.storage.from(bucket).remove([filePath]);

    if (error) {
      console.error('Failed to delete file:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Delete file error:', error);
    return false;
  }
};

export const getSignedUrl = async (
  bucket: string,
  filePath: string,
  expiresIn = 3600
): Promise<string | null> => {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error || !data) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Signed URL error:', error);
    return null;
  }
};

// Vérifier si un bucket existe
export const checkBucketExists = async (bucket: string): Promise<boolean> => {
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(bucket);
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
};

// Créer un bucket s'il n'existe pas
export const ensureBucketExists = async (bucket: string, isPublic: boolean = true): Promise<boolean> => {
  try {
    const exists = await checkBucketExists(bucket);
    if (exists) return true;
    
    const { error } = await supabaseAdmin.storage.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: 10485760, // 10MB
    });
    
    if (error) {
      console.error(`Failed to create bucket ${bucket}:`, error);
      return false;
    }
    
    console.log(`✅ Bucket created: ${bucket}`);
    return true;
  } catch (error) {
    console.error(`Error ensuring bucket ${bucket}:`, error);
    return false;
  }
};