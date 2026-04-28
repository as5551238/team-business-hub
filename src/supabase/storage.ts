import { getSupabaseClient } from '@/supabase/client';

export const BUCKET_NAMES = {
  attachments: 'attachments',
  templates: 'templates',
  notes: 'notes',
} as const;

export type BucketName = (typeof BUCKET_NAMES)[keyof typeof BUCKET_NAMES];

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
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) {
      console.error('Upload failed:', error.message);
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
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
  } catch (e: any) {
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
  } catch (e: any) {
    console.error('List error:', e);
    return null;
  }
}
