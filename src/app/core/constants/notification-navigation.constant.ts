import { AppNotification } from '@app/core/models/notification/notification.model';
import { ROUTES_ADMIN } from '@app/core/constants/router.constant';

/** Resultado de resolver hacia una ruta del admin desde `notification.data.type` */
export type AdminNotificationNavigation = {
  commands: string[];
  queryParams?: Record<string, string>;
};

/**
 * Resuelve navegación según `data.type` del payload de Laravel.
 * Registrar aquí cada tipo nuevo junto con su ruta.
 */
export const ADMIN_NOTIFICATION_NAVIGATION_BY_TYPE: Record<
  string,
  (notification: AppNotification) => AdminNotificationNavigation | null
> = {
  'import-report': (n) => {
    const importId = n.data?.id?.trim();
    if (!importId) {
      return { commands: ['/admin/import-history'] };
    }
    return {
      commands: ['/admin/import-history'],
      queryParams: { import: importId },
    };
  },
  'manual-registration-requested': (n) => {
    const requestId = (n.data?.request_id || n.data?.id || '').trim();
    const fromUrl = adminPathFromNotificationUrl(n.data?.url);
    const commands = fromUrl?.commands ?? [ROUTES_ADMIN.MANUAL_REGISTRATIONS];
    const queryParams: Record<string, string> = { ...(fromUrl?.queryParams ?? {}) };
    if (requestId && !queryParams['request']) {
      queryParams['request'] = requestId;
    }
    const processNumber = n.data?.process_number?.trim();
    if (processNumber && !queryParams['process_number']) {
      queryParams['process_number'] = processNumber;
    }
    return {
      commands,
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
    };
  },
};

/** Alias por si llega typo (`impor-report` → `import-report`) */
export const NOTIFICATION_BUSINESS_TYPE_ALIASES: Record<string, string> = {
  'impor-report': 'import-report',
  manual_registration_requested: 'manual-registration-requested',
};

export function normalizeNotificationBusinessType(raw: string | null | undefined): string {
  const t = (raw || '').trim().toLowerCase();
  if (!t) return '';
  return NOTIFICATION_BUSINESS_TYPE_ALIASES[t] ?? t;
}

export function resolveAdminNotificationNavigation(
  notification: AppNotification
): AdminNotificationNavigation | null {
  const key = normalizeNotificationBusinessType(notification.data?.type);
  const resolver = key ? ADMIN_NOTIFICATION_NAVIGATION_BY_TYPE[key] : undefined;
  if (resolver) {
    return resolver(notification);
  }
  return adminPathFromNotificationUrl(notification.data?.url);
}

/** Solo rutas internas `/admin/...` (ignora URLs absolutas o paths ajenos). */
function adminPathFromNotificationUrl(raw: string | null | undefined): AdminNotificationNavigation | null {
  const url = (raw || '').trim();
  if (!url.startsWith('/admin')) {
    return null;
  }
  const [path, qs] = url.split('?');
  const queryParams: Record<string, string> = {};
  if (qs) {
    new URLSearchParams(qs).forEach((value, key) => {
      if (value) queryParams[key] = value;
    });
  }
  return {
    commands: [path.replace(/\/$/, '') || '/admin'],
    queryParams: Object.keys(queryParams).length ? queryParams : undefined,
  };
}
