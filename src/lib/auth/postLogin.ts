/** Resolve where to land after login: the pre-auth deep link if sane,
 * else the role dashboard. `from` is untrusted router state. */
export function resolvePostLoginPath(from: unknown, fallback: string): string {
  if (typeof from !== 'string') return fallback;
  if (!from.startsWith('#/')) return fallback;
  const path = from.slice(1); // '#/helpdesk/new' -> '/helpdesk/new'
  if (path === '/' || path.startsWith('/login')) return fallback;
  return path;
}
