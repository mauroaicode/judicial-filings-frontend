/** Filtros opcionales del detalle de consolidado (admin). */
export interface NotificationDigestFilter {
  process_number?: string;
  registration_date_from?: string;
  registration_date_to?: string;
  action_date_from?: string;
  action_date_to?: string;
  term_start_date_from?: string;
  term_start_date_to?: string;
  term_end_date_from?: string;
  term_end_date_to?: string;
}

/** Fila de actuación dentro del consolidado. */
export interface NotificationDigestDetailItem {
  process_action_id: string;
  process_id?: string | null;
  process_number: string;
  court: string;
  plaintiff: string;
  defendant: string;
  plaintiffs?: string[];
  defendants?: string[];
  registration_date: string;
  action_date?: string;
  term_start_date?: string | null;
  term_end_date?: string | null;
  action_text: string;
  action?: string;
  annotation?: string | null;
  alert_level?: 'red' | 'yellow' | 'green' | null;
  lawyer_role?: string | null;
  is_merged?: boolean;
  linked_action_text?: string | null;
  linked_annotation?: string | null;
  notified_action_id?: string | null;
  fijacion_action_id?: string | null;
  is_alert?: boolean;
  matched_keywords?: string | string[] | null;
  alert_highlights?: unknown[];
}

/** Fila ya lista para pintar (posible related_action en el futuro). */
export type NotificationDigestDisplayRow = NotificationDigestDetailItem & {
  related_action?: NotificationDigestDetailItem | null;
};

/** Metadata del consolidado (wrapper en data[0]). */
export interface NotificationDigestDetail {
  id: string | null;
  organization_id: string;
  organization_name: string;
  is_pending: boolean;
  date: string;
  time: string;
  period: string;
  actions_count: number;
  is_notified: boolean;
  email_notified_at: string | null;
  whatsapp_notified_at: string | null;
  sms_notified_at: string | null;
  /** Solo en un consolidado ya enviado. El pendiente no los trae. */
  is_viewed?: boolean;
  /** Fecha ya formateada, o null si nadie lo abrió. */
  viewed_at?: string | null;
  data: NotificationDigestDetailItem[];
}

/** Filtros opcionales de GET /api/admin/notification-digests. */
export interface NotificationDigestListQuery {
  organization_id?: string;
  process_number?: string;
  /** 1 = alguien de la organización lo abrió. 0 = nadie lo ha visto. */
  is_viewed?: '0' | '1';
  registration_date_from?: string;
  registration_date_to?: string;
  action_date_from?: string;
  action_date_to?: string;
  created_at_from?: string;
  created_at_to?: string;
  term_start_date_from?: string;
  term_start_date_to?: string;
  term_end_date_from?: string;
  term_end_date_to?: string;
  per_page?: number;
  page?: number;
}

/** Fila del listado admin de consolidados. */
export interface NotificationDigestListItem {
  id: string;
  organization_id: string;
  organization_name: string;
  date: string;
  time: string;
  period: string;
  actions_count: number;
  is_notified: boolean;
  email_notified_at: string | null;
  whatsapp_notified_at: string | null;
  sms_notified_at: string | null;
  is_viewed: boolean;
  viewed_at: string | null;
}

/** Paginación Laravel API Resource: data, links y meta. */
export interface NotificationDigestListResponse {
  data: NotificationDigestListItem[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    links?: {
      url: string | null;
      label: string;
      active: boolean;
    }[];
    path?: string;
    per_page: number;
    to: number | null;
    total: number;
  };
}

/** Origen de la primera apertura de una persona. */
export type NotificationDigestOpenedVia = 'app' | 'email';

/** Una persona que abrió el consolidado. `viewed_at` ya viene formateado. */
export interface NotificationDigestView {
  id: string;
  app_user_id: string;
  app_user_name: string;
  app_user_last_name: string;
  email: string | null;
  viewed_at: string;
  opened_via: NotificationDigestOpenedVia;
}

/** GET /api/admin/notification-digests/{id}/views. Solo `data`, sin paginación. */
export interface NotificationDigestViewsResponse {
  data: NotificationDigestView[];
}

/** Meta usada por la tabla (mismo recorte que el resto de listados admin). */
export interface NotificationDigestListMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/**
 * Payload de Echo `.NotificationDigestViewed` en el canal privado `admin.presence`.
 * `viewed_at` llega en ISO 8601; el listado lo muestra ya formateado.
 */
export interface NotificationDigestViewedPayload {
  notification_digest_id: string;
  organization_id: string;
  organization_name: string;
  app_user_id: string;
  app_user_name: string;
  app_user_last_name: string;
  viewed_at: string;
  opened_via: 'app' | 'email';
}

const VIEWED_AT_MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/**
 * Convierte el ISO del evento al formato del listado ("15 de enero de 2030 8:00am").
 * Si el valor ya viene formateado, se deja igual.
 */
export function formatNotificationDigestViewedAt(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const month = VIEWED_AT_MONTHS_ES[Number(pick('month')) - 1];
  const day = Number(pick('day'));
  const year = pick('year');
  const hour = Number(pick('hour'));
  const minute = pick('minute').padStart(2, '0');
  if (!month || !day || !year || !hour || minute.length !== 2) return raw;

  const suffix = pick('dayPeriod').toLowerCase().startsWith('p') ? 'pm' : 'am';
  return `${day} de ${month} de ${year} ${hour}:${minute}${suffix}`;
}

/** Respuesta paginada Laravel del detalle (pending o por digestId). */
export interface NotificationDigestDetailResponse {
  data: NotificationDigestDetail[];
  total: number;
  per_page: number;
  current_page: number;
  last_page?: number;
  from: number | null;
  to: number | null;
  first_page_url?: string;
  last_page_url?: string;
  next_page_url?: string | null;
  prev_page_url?: string | null;
  path?: string;
  links?: {
    url: string | null;
    label: string;
    active: boolean;
  }[];
}
