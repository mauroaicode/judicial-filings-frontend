/**
 * Modo de estado de la organización (fuente de verdad para la UI).
 * - active: login + seguimiento + canales on
 * - tracking_paused: login OK, sin consulta de procesos ni notificaciones; canales off
 * - inactive: sin login + sin seguimiento + canales off
 */
export type OrganizationStatusMode = 'active' | 'inactive' | 'tracking_paused';

/**
 * Payload POST /organizations/{id}/active-status
 */
export interface UpdateOrganizationActiveStatusPayload {
  mode: OrganizationStatusMode;
  /** Solo aplica en inactive / tracking_paused; opt-in (default false). */
  notify_users?: boolean;
}

/**
 * Organization (Client) Model - Based on API response
 */
export interface Organization {
  index: number;
  id: string;
  name: string;
  slug: string;
  type: string;
  identification: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  is_active: boolean;
  /** Si false, no se consultan procesos ni se notifican actuaciones. */
  is_process_tracking_enabled?: boolean;
  /** Modo compuesto; preferir este campo para badges y acciones. */
  status_mode?: OrganizationStatusMode;
  created_at: string;
  updated_at: string;
  password?: string; // Generated password returned by backend
  is_receiving_notifications: boolean;
  /** Límite efectivo (override o default del sistema). `null` = ilimitado. */
  max_active_processes?: number | null;
  /** Default global del sistema (`.env`). `null` = ilimitado. */
  default_max_active_processes?: number | null;
  /** Radicados activos distintos de la organización. */
  active_processes_count?: number;
}

/**
 * Organization filter options (query params)
 */
export interface OrganizationFilter {
  page?: number;
  per_page?: number;
  name?: string;
  type?: string;
  is_active?: string; // 'active' | 'inactive'
  created_at_from?: string;
  created_at_to?: string;
  email?: string;
}

/**
 * Select option for dropdowns (organization-types, organization-statuses)
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * API response for organization-types / organization-statuses
 */
export interface SelectOptionsResponse {
  data: SelectOption[];
}

/**
 * Laravel pagination link
 */
export interface PaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

/**
 * Organization list response from API (Laravel Pagination)
 */
export interface OrganizationResponse {
  current_page: number;
  data: Organization[];
  first_page_url: string;
  from: number;
  last_page: number;
  last_page_url: string;
  links: PaginationLink[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number;
  total: number;
}

/**
 * GET /organizations/stats — conteos agregados
 */
export interface OrganizationStats {
  total: number;
  active: number;
  inactive: number;
  natural: number;
  juridical: number;
}

/**
 * Organization response meta (simplified for component usage)
 */
export interface OrganizationResponseMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/**
 * Payload to create an organization (POST /organizations)
 */
export interface CreateOrganizationPayload {
  name: string;
  type: 'natural' | 'juridical';
  identification?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  generate_password?: boolean;
}

/**
 * Configuración de límites de radicados de una organización.
 * GET /organizations/{id} → `settings` y PUT /organizations/{id}/settings
 */
export interface OrganizationSettings {
  organization_id?: string;
  max_active_processes: number | null;
  max_active_processes_configured: number | null;
  default_max_active_processes: number | null;
  remaining_slots: number | null;
  active_processes_count?: number;
  /** Si true, la org puede ver/descargar PDF de actuaciones (ACL + app). */
  can_view_action_documents?: boolean;
}

/**
 * Detalle de organización para el modal de configuración.
 * GET /organizations/{id}
 */
export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  type: 'natural' | 'juridical' | string;
  type_label: string;
  identification: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  contact_person: string | null;
  is_active: boolean;
  is_process_tracking_enabled?: boolean;
  status_mode?: OrganizationStatusMode;
  active_processes_count: number;
  settings: OrganizationSettings;
}

/**
 * Payload PUT /organizations/{id}/settings
 * Puede enviar solo el flag, solo cupos, o ambos.
 * `max_active_processes: null` quita el override y vuelve al default del sistema.
 */
export interface UpdateOrganizationSettingsPayload {
  max_active_processes?: number | null;
  can_view_action_documents?: boolean;
}

/**
 * Respuesta PUT /organizations/{id}/settings
 */
export interface UpdateOrganizationSettingsResponse {
  message: string;
  settings: OrganizationSettings;
}
