import { supabase } from './supabase';

/** Headers for API routes that require `Authorization: Bearer <access_token>`. */
export async function getBearerAuthHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}
