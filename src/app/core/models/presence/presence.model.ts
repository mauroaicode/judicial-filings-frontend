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

/** Miembro del canal de presencia. El admin llega con guard "admin". */
export interface PresenceChannelMember {
  id?: string | number;
  guard?: string;
  info?: {
    guard?: string;
  };
}
