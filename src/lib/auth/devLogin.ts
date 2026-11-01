interface DevLoginEnv {
  DEV?: boolean;
  PROD?: boolean;
  VITE_DEV_LOGIN?: string;
}

/**
 * The offline dev superuser (admin@dev.local), which bypasses Supabase and so
 * every RLS policy. Needs VITE_DEV_LOGIN=1 in .env.local and a non-production
 * build: `import.meta.env.DEV` alone was true for `vite build --mode
 * development`, which shipped it (SEC-07).
 */
export function isDevLogin(email: string, password: string, env: DevLoginEnv = import.meta.env): boolean {
  return env.VITE_DEV_LOGIN === '1' && !env.PROD
    && email === 'admin@dev.local' && password === 'admin123';
}
