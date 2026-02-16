export const ROUTES_ADMIN = {
  DASHBOARD: '/admin/dashboard',
  PROCESSES: '/admin/processes',
  ORGANIZATIONS: '/admin/organizations',
  SIGN_IN: '/sign-in',
  SIGN_OUT: '/sign-out',
} as const;

export type RoleName = 'super_admin' | 'admin' | 'secretary';

export const ROLE_ROUTE_MAP: Record<RoleName, string> = {
  super_admin: ROUTES_ADMIN.PROCESSES,
  admin: ROUTES_ADMIN.PROCESSES,
  secretary: ROUTES_ADMIN.PROCESSES,
} as const;

