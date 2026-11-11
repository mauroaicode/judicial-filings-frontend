export interface PresenceOrganizationRef {
  id: string;
  name: string;
}

export interface PresencePerson {
  name: string | null;
  last_name: string | null;
  email: string | null;
  identification: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organizations?: PresenceOrganizationRef[];
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  place: string | null;
}

export interface OnlineUser extends PresencePerson {
  id: string;
  last_seen_at: string | null;
}

export interface OnlinePresenceResponse {
  presence_available: boolean;
  total: number;
  users: OnlineUser[];
}

export interface DailyPresenceRow extends PresencePerson {
  id: string;
  app_user_id: string;
  activity_date: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  login_count: number;
  is_online: boolean;
}

export interface PresencePage {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface DailyPresenceResponse extends PresencePage {
  data: DailyPresenceRow[];
  next_page_url: string | null;
  prev_page_url: string | null;
}

export interface PresenceSummaryRow {
  app_user_id: string;
  organization_id: string | null;
  organization_name: string | null;
  name: string | null;
  last_name: string | null;
  email: string | null;
  identification: string | null;
  login_count: number;
  days_online: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface PresenceSummaryTotals {
  users: number;
  login_count: number;
  days_online: number;
}

export interface PresenceSummaryResponse extends PresencePage {
  from: string;
  to: string;
  organization_id: string | null;
  totals: PresenceSummaryTotals;
  data: PresenceSummaryRow[];
}

export interface DailyPresenceQuery {
  date?: string;
  from?: string;
  to?: string;
  organization_id?: string;
  page?: number;
  per_page?: number;
}

export interface PresenceSummaryQuery {
  organization_id?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

/** Estado de conexión de una organización. */
export type OrganizationConnectionStatus = 'never' | 'stale' | 'recent';

/** Filtro del listado. `all` incluye never, stale y recent. */
export type OrganizationPresenceListStatus = 'never' | 'stale' | 'all';

export interface OrganizationPresenceRow {
  organization_id: string;
  organization_name: string;
  is_active: boolean;
  users_count: number;
  last_seen_at: string | null;
  days_inactive: number | null;
  status: OrganizationConnectionStatus;
}

export interface OrganizationPresenceTotals {
  never: number;
  stale: number;
  recent: number;
}

export interface OrganizationPresenceResponse extends PresencePage {
  data: OrganizationPresenceRow[];
  status: OrganizationPresenceListStatus;
  inactive_days: number;
  is_active: boolean | null;
  search: string | null;
  totals: OrganizationPresenceTotals;
}

export interface OrganizationPresenceQuery {
  status?: OrganizationPresenceListStatus;
  inactive_days?: number;
  /**
   * Omitido o `true`: solo organizaciones activas.
   * `false`: solo inactivas (`is_active=0`).
   * `''`: activas e inactivas (`is_active=`).
   */
  is_active?: boolean | '';
  search?: string;
  page?: number;
  per_page?: number;
}

/** Miembro del canal de presencia. El admin llega con guard "admin". */
export interface PresenceChannelMember {
  id?: string | number;
  guard?: string;
  info?: {
    guard?: string;
  };
}
