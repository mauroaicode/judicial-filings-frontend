import { AppNotification } from '@app/core/models/notification/notification.model';

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
};

/** Alias por si llega typo (`impor-report` → `import-report`) */
export const NOTIFICATION_BUSINESS_TYPE_ALIASES: Record<string, string> = {
  'impor-report': 'import-report',
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
  return resolver ? resolver(notification) : null;
}
