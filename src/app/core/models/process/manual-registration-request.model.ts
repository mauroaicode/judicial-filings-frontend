export type ManualRegistrationReason = 'not_found' | 'private' | 'all_private';
export type ManualRegistrationStatus = 'pending' | 'registered' | 'rejected';
export type ManualRegistrationLawyerRole = 'plaintiff' | 'defendant';

export interface ManualRegistrationRequest {
  id: string;
  process_number: string;
  reason: ManualRegistrationReason;
  reason_label: string;
  status: ManualRegistrationStatus;
  lawyer_role: ManualRegistrationLawyerRole | null;
  unassigned_actions_count: number;
  discord_notified: boolean;
  organization_id: string;
  organization_name: string;
  app_user_id: string;
  requested_by_name: string;
  requested_by_identification: string;
  requested_by_email: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ManualRegistrationFilter {
  status?: ManualRegistrationStatus | '';
  reason?: ManualRegistrationReason | '';
  organization?: string;
  process_number?: string;
  page?: number;
  per_page?: number;
}

export interface ManualRegistrationListResponse {
  current_page: number;
  data: ManualRegistrationRequest[];
  from: number;
  last_page: number;
  per_page: number;
  to: number;
  total: number;
}

export interface ManualRegistrationListMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

export interface ResolveManualRegistrationPayload {
  status: 'registered' | 'rejected';
}

export interface ResolveManualRegistrationResponse {
  message: string;
  data: ManualRegistrationRequest;
}
