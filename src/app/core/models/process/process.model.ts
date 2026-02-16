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
  is_private: boolean;
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
  is_private: boolean;
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
