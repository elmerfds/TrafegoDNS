/**
 * Principals that exist only in memory (auth-disabled mode, global API key).
 * They have no row in `users`, so their IDs must never be written to a
 * column with a foreign key to users.id.
 */
export const ANONYMOUS_USER_ID = 'anonymous';
export const GLOBAL_API_KEY_USER_ID = 'global-api-key';

export function isSyntheticUserId(id: string | null | undefined): boolean {
  return id === ANONYMOUS_USER_ID || id === GLOBAL_API_KEY_USER_ID;
}

/** The user ID to store in an FK column: null for synthetic principals. */
export function persistableUserId(id: string | null | undefined): string | null {
  return id && !isSyntheticUserId(id) ? id : null;
}

/**
 * Maximum permissions each role may hold or delegate to an API key.
 * (OWASP A01: a key can never do more than its owner currently can.)
 */
export const ROLE_ALLOWED_PERMISSIONS: Record<string, string[]> = {
  admin: ['*', 'read', 'write'],
  user: ['read', 'write'],
  readonly: ['read'],
};

/** Key permissions capped to what the owner's current role allows. */
export function effectiveKeyPermissions(keyPermissions: string[], ownerRole: string): string[] {
  const allowed = ROLE_ALLOWED_PERMISSIONS[ownerRole] ?? [];
  // '*' means "everything the owner can do", so it narrows with the role
  if (keyPermissions.includes('*')) return [...allowed];
  return keyPermissions.filter((p) => allowed.includes(p));
}
