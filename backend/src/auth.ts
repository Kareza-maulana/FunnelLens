import { sql } from './database';
import { config } from './config';

export type Owner = { id: string; authSubject: string; displayName: string };

export async function authenticateOwner(authorization?: string): Promise<Owner> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'Sesi login diperlukan.');

  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(401, 'Sesi Supabase tidak valid atau sudah kedaluwarsa.');
  const user = await response.json() as { id?: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
  if (user.id !== config.OWNER_AUTH_SUBJECT) throw new ApiError(403, 'Akun ini belum mendapat akses owner FunnelLens.');

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Owner';
  const rows = await sql<{ id: string; auth_subject: string; display_name: string; is_owner: boolean; disabled_at: Date | null }[]>`
    INSERT INTO app.users(auth_subject, display_name, is_owner)
    VALUES (${user.id}, ${displayName}, true)
    ON CONFLICT (auth_subject) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id, auth_subject, display_name, is_owner, disabled_at
  `;
  const row = rows[0];
  if (!row?.is_owner || row.disabled_at) throw new ApiError(403, 'Akun owner FunnelLens dinonaktifkan.');
  return { id: row.id, authSubject: row.auth_subject, displayName: row.display_name };
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
