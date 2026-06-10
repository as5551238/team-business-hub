import { getSupabaseClient } from '@/supabase/client';

export const BUCKET_NAMES = {
  attachments: 'attachments',
  templates: 'templates',
  notes: 'notes',
} as const;

export type BucketName = (typeof BUCKET_NAMES)[keyof typeof BUCKET_NAMES];

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/zip', 'application/json', 'application/xml',
]);

function sanitizeFilename(name: string): string {
  // Allow Unicode letters/numbers, dots, hyphens, underscores; strip path traversal
  return name.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/\.{2,}/g, '.').replace(/^[_-]+|[_-]+$/g, '');
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }
  if (file.size > 50 * 1024 * 1024) {
    console.error('File too large:', file.size);
    return null;
  }
  if (!ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith('image/')) {
    console.error('File type not allowed:', file.type);
    return null;
  }
  const safePath = path.split('/').map((segment, i) => i === path.split('/').length - 1 ? sanitizeFilename(segment) : segment).join('/');
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(safePath, file, { cacheControl: '3600', upsert: true });
    if (error) {
      console.error('Upload failed:', error.message);
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(safePath);
    return data.publicUrl;
  } catch (e: unknown) {
    console.error('Upload error:', e);
    return null;
  }
}

export async function deleteFile(bucket: string, paths: string[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }
  try {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.error('Delete failed:', error.message);
      return false;
    }
    return true;
  } catch (e: unknown) {
    console.error('Delete error:', e);
    return false;
  }
}

export function getFileUrl(bucket: string, path: string): string {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client not initialized');
    return '';
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function listFiles(
  bucket: string,
  path?: string,
): Promise<Array<{ name: string; id: string }> | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }
  try {
    const { data, error } = await supabase.storage.from(bucket).list(path);
    if (error) {
      console.error('List failed:', error.message);
      return null;
    }
    return (data ?? []).map((item) => ({ name: item.name, id: item.id }));
  } catch (e: unknown) {
    console.error('List error:', e);
    return null;
  }
}
