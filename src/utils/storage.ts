import { supabaseAdmin } from '../config/supabase';
import { STORAGE_BUCKETS } from '../config/constants';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export const uploadFile = async (
  bucket: string,
  file: Express.Multer.File,
  folder?: string
): Promise<string> => {
  const ext = path.extname(file.originalname);
  const filename = `${folder ? folder + '/' : ''}${uuidv4()}${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
};

export const deleteFile = async (bucket: string, fileUrl: string): Promise<void> => {
  const urlParts = fileUrl.split(`${bucket}/`);
  if (urlParts.length < 2) return;

  const filePath = urlParts[1];
  const { error } = await supabaseAdmin.storage.from(bucket).remove([filePath]);

  if (error) {
    console.error('Failed to delete file:', error);
  }
};

export const getSignedUrl = async (
  bucket: string,
  filePath: string,
  expiresIn = 3600
): Promise<string> => {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data) {
    throw new Error('Failed to generate signed URL');
  }

  return data.signedUrl;
};

export { STORAGE_BUCKETS };
