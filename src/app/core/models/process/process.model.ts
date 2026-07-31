/**
 * Process instance (sub-row when has_multiple_instances)
 */
export interface ProcessInstance {
  index: number;
  id: string;
  process_number: string;
  court: string;
  process_class: string;
  subclass_process: string;
  process_date: string;
  last_activity_date: string | null;
  is_private?: boolean;
  /** Fuente cuando el proceso es privado (p. ej. SAMAI) */
  data_source_slug?: string | null;
  data_source_name?: string | null;
  has_multiple_instances: boolean;
  status_label: string;
  created_at: string;
  plaintiff: string | null;
  defendant: string | null;
  organization: string | null;
  organizations_count?: number;
  plaintiffs_count?: number | null;
  defendants_count?: number | null;
  organizations?: string[];
  plaintiffs?: string[];
  defendants?: string[];
  other_subject?: string | null;
  others_count?: number | null;
  others?: string[];
  subjects_count?: number | null;
}

/**
 * Process Model - Based on API response
 */
export interface Process {
  index: number;
  id: string;
  process_number: string;
  court: string;
  process_class: string;
  subclass_process: string;
  process_date: string;
  last_activity_date: string | null;
  is_private?: boolean;
  /** Fuente cuando el proceso es privado (p. ej. SAMAI) */
  data_source_slug?: string | null;
  data_source_name?: string | null;
  has_multiple_instances: boolean;
  status_label: string;
  created_at: string;
  plaintiff: string | null;
  defendant: string | null;
  organization: string | null;
  organizations_count?: number;
  plaintiffs_count?: number | null;
  defendants_count?: number | null;
  /** Lista completa de organizaciones (para tooltip) */
  organizations?: string[];
  /** Lista completa de demandantes (para tooltip) */
  plaintiffs?: string[];
  /** Lista completa de demandados (para tooltip) */
  defendants?: string[];
  /** Otros sujetos procesales (apoderados, testigos, etc.) */
  other_subject?: string | null;
  others_count?: number | null;
  others?: string[];
  subjects_count?: number | null;
  /** Instancias del mismo radicado (filas expandibles) */
  instances?: ProcessInstance[];
}

/**
 * Process Filter Options
 */
export interface ProcessFilter {
  process_number?: string;
  court?: string;
  process_class?: string;
  plaintiff?: string;
  defendant?: string;
  organization?: string;
  status?: string; // 'active' | 'inactive'
  /** Filtra por origen: `private` | `public` (query `privacy`) */
  privacy?: 'private' | 'public';
  has_multiple_instances?: boolean;
  process_date?: string;
  process_date_from?: string;
  process_date_to?: string;
  created_at_from?: string;
  created_at_to?: string;
  last_api_update_from?: string;
  last_api_update_to?: string;
  page?: number;
  per_page?: number;
}

/**
 * Laravel Pagination Link
 */
export interface PaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

/**
 * Process Response from API (Laravel Pagination)
 */
export interface ProcessResponse {
  current_page: number;
  data: Process[];
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
 * Process Response Meta (simplified for component usage)
 */
export interface ProcessResponseMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/**
 * Import validation error item
 */
export interface ProcessImportError {
  rule: string;
  message: string;
  details?: { process_number?: string; [key: string]: unknown };
}

/**
 * Import response stats
 */
export interface ProcessImportStats {
  validated: boolean;
  succeeded: number;
  failed: number;
  total: number;
  errors?: ProcessImportError[];
  validation_errors?: ProcessImportError[];
}

/**
 * Process import success response
 */
export interface ProcessImportSuccessResponse {
  success: true;
  message: string;
  stats: ProcessImportStats;
}

/**
 * Process import error response
 */
export interface ProcessImportErrorResponse {
  success: false;
  message: string;
  stats: ProcessImportStats;
}

export type ProcessImportResponse = ProcessImportSuccessResponse | ProcessImportErrorResponse;

/**
 * Process import batch response (async import - report by email)
 * | respuesta síncrona de importación privada (stats inmediatos)
 */
export interface ProcessImportBatchResponse {
  message: string;
  /** Presente en importación estándar (segundo plano) */
  batch_id?: string;
  /** Presente en POST /processes/private-import (éxito o 422 con filas) */
  import_batch_id?: string;
  /** Stats síncronos de importación privada */
  processes_created?: number;
  processes_updated?: number;
  actions_imported?: number;
  /** Errores de validación (campo o filas del Excel) */
  errors?: {
    rows?: Record<string, string | string[]>;
    organization_id?: string | string[];
    file?: string | string[];
    data_source_slug?: string | string[];
    [key: string]: string | string[] | Record<string, string | string[]> | undefined;
  };
}

/**
 * Motivo por el que una actuación del Excel no se insertó.
 * Hoy el backend solo emite "duplicate".
 */
export type ActuacionSkipReason = 'duplicate';

/**
 * Fila del Excel omitida en POST /processes/actuaciones-import.
 */
export interface ProcessActuacionSkippedItem {
  process_number: string;
  action: string;
  annotation: string | null;
  /** YYYY-MM-DD */
  registration_date: string | null;
  court: string | null;
  /** Fila del Excel (1 = encabezados) */
  excel_row: number;
  reason: ActuacionSkipReason;
}

/**
 * Respuesta POST /processes/actuaciones-import (éxito síncrono).
 * Los radicados sin proceso coincidente se guardan en el repositorio histórico;
 * cuando se cree el proceso más adelante, el historial se carga automáticamente.
 */
export interface ActuacionesImportResponse {
  message?: string;
  actions_imported?: number;
  actions_skipped?: number;
  /** Actuaciones guardadas en repositorio (radicado aún sin proceso en BD) */
  actions_stored_unassigned?: number;
  processes_updated?: number;
  /** Cantidad de radicados distintos en el repositorio pendiente */
  unassigned_count?: number;
  /** Lista de esos radicados */
  unassigned_process_numbers?: string[];
  /** Detalle de filas omitidas por duplicado (debe coincidir con actions_skipped) */
  skipped_actions?: ProcessActuacionSkippedItem[];
  import_batch_id?: string;
  errors?: {
    rows?: Record<string, string | string[]>;
    file?: string | string[];
    [key: string]: string | string[] | Record<string, string | string[]> | undefined;
  };
}

/**
 * Dashboard KPI stats for processes module
 */
export interface ProcessDashboardStats {
  total_processes: number;
  active_processes: number;
  orphan_processes: number;
  /** Procesos con origen privado (p. ej. SAMAI u otras fuentes) */
  private_processes?: number;
  processes_with_multiple_instances: number;
  outdated_processes: number;
  critical_alert_processes: number;
  early_attention_processes: number;
}

// -----------------------------------------------------------------------------------------------------
// Process Detail + Actions (used by Process Detail module)
// -----------------------------------------------------------------------------------------------------

/**
 * Process Detail - Full process information
 */
export interface ProcessDetail {
  id: string;
  process_id: number;
  process_number: string;
  court: string;
  speaker?: string | null;
  department: string;
  process_type: string;
  process_class: string;
  subclass_process: string;
  litigants: string | null;
  process_date: string;
  last_activity_date: string | null;
  location: string;
  filing_content: string | null;
  is_private: boolean;
  has_multiple_instances: boolean;
  last_api_update: string;
  status_label: string;
  created_at: string;
  updated_at: string;
  alert_level?: 'red' | 'yellow' | 'green' | null;
  lawyer_role?: string | null;
}

/**
 * Process instance summary for detail view selector (GET /processes/:id/instances)
 */
export interface ProcessDetailInstance {
  id: string;
  court: string;
  actions_count: number;
  last_activity_date: string | null;
  last_api_update: string;
  status_label: string;
  lawyer_role?: string | null;
  inactivity_alert_level?: 'red' | 'yellow' | 'green' | null;
}

/**
 * Subject - Process subject (Demandante/Demandado)
 */
export interface Subject {
  id: string;
  subject_registration_id: number | null;
  subject_type: string;
  is_cited: boolean;
  identification: string | null;
  name_or_business_name: string;
  /** Present in PUT response; infer from subject_registration_id on GET if absent */
  is_manual?: boolean;
}

export interface SubjectUpsertPayload {
  id?: string;
  subject_type: string;
  name_or_business_name: string;
}

export interface SaveProcessSubjectsResponse {
  message: string;
  subjects: Subject[];
}

/**
 * Organization interested in a process (admin process detail)
 */
export interface ProcessInterestedOrganization {
  id: string;
  name: string;
  type: string;
  type_label: string;
  lawyer_role: string | null;
  lawyer_role_label: string | null;
  status: string;
  status_label: string;
  is_active?: boolean;
  interest_date: string;
  inactivity_alert_level?: 'red' | 'yellow' | 'green' | null;
  alert_level?: 'red' | 'yellow' | 'green' | null;
}

export interface ProcessInterestedOrganizations {
  count: number;
  items: ProcessInterestedOrganization[];
}

/**
 * Process Detail Response
 */
export interface ProcessDetailResponse {
  process: ProcessDetail;
  subjects: Subject[];
  organizations?: ProcessInterestedOrganizations;
}

/**
 * Range to highlight inside annotation (keyword match from API)
 */
export interface AlertHighlight {
  start: number;
  end: number;
  text: string;
  source?: string;
}

/**
 * Action - Process action/actuación
 */
export interface Action {
  index?: number;
  id: string;
  action_registration_id?: number;
  cons_action?: number;
  action_date: string;
  registration_date: string;
  action: string;
  annotation: string | null;
  term_start_date?: string | null;
  term_end_date?: string | null;
  court?: string;
  created_at?: string;
  updated_at?: string;
  alert_highlights?: AlertHighlight[] | null;
  notified_action_id?: string | null;
  fijacion_action_id?: string | null;
  related_action?: Action | null;
}

/**
 * Alert keyword for filtering actions
 */
export interface AlertKeyword {
  id: string;
  name: string;
  slug: string;
}

export interface AlertKeywordsResponse {
  data: AlertKeyword[];
}

/**
 * Alert keyword with count
 */
export interface AlertKeywordStat {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export interface AlertKeywordStatsResponse {
  data: AlertKeywordStat[];
}

/**
 * Action Filter Options
 */
export interface ActionFilter {
  action_date_from?: string;
  action_date_to?: string;
  registration_date_from?: string;
  registration_date_to?: string;
  alert_slug?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

/**
 * Action Response from API (Laravel Pagination)
 */
export interface ActionResponse {
  current_page: number;
  data: Action[];
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
 * Action Response Meta (simplified for component usage)
 */
export interface ActionResponseMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/**
 * Bulk Role Update Alert Data
 */
export interface BulkRoleUpdateAlert {
  count: number;
  process_ids: string[];
}

/**
 * Bulk Role Update Failure Data
 */
export interface BulkRoleUpdateFailure {
  count: number;
  process_numbers: string[];
}

/**
 * Bulk Role Update Response
 */
export interface BulkRoleUpdateResponse {
  message: string;
  total_updated: number;
  red_alerts: BulkRoleUpdateAlert;
  yellow_alerts: BulkRoleUpdateAlert;
  green_alerts: BulkRoleUpdateAlert;
  no_alerts: BulkRoleUpdateAlert;
  failed: BulkRoleUpdateFailure;
}
