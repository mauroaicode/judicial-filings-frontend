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
  data: NotificationDigestDetailItem[];
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
