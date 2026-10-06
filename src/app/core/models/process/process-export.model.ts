/** Filtros enviados al encolar un export (y guardados en el historial). */
export interface ProcessExportFilters {
  status?: 'active' | 'inactive' | 'suspended' | null;
  created_at_from?: string | null;
  created_at_to?: string | null;
  updated_at_from?: string | null;
  updated_at_to?: string | null;
  include_plaintiffs?: boolean;
  include_defendants?: boolean;
  include_other_subjects?: boolean;
  /** Si true, el Excel incluye hoja de actuaciones. Default false. */
  include_actions?: boolean;
  /** Y-m-d — filtra actuaciones por action_date */
  actions_from?: string | null;
  actions_to?: string | null;
}

export type ProcessExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProcessExportItem {
  id: string;
  organization_id: string;
  organization_name?: string | null;
  requested_by?: string | null;
  requested_by_name?: string | null;
  status: ProcessExportStatus | string;
  /** Etiqueta humana del backend, p. ej. "Completado" */
  status_label?: string | null;
  filters?: ProcessExportFilters | null;
  /** Filas de la hoja Procesos */
  row_count?: number | null;
  /** Filas de la hoja Actuaciones */
  action_row_count?: number | null;
  file_name?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  downloadable?: boolean;
  download_url?: string | null;
  can_rerun?: boolean;
  /** Formato humano del backend (DateFormatHelper) o ISO */
  created_at?: string | null;
}

export interface ProcessExportEnqueueResponse {
  message?: string;
  data: ProcessExportItem;
}

export interface ProcessExportDetailResponse {
  data: ProcessExportItem;
}

export interface ProcessExportHistoryResponse {
  current_page: number;
  data: ProcessExportItem[];
  first_page_url?: string;
  from: number;
  last_page: number;
  last_page_url?: string;
  links?: {
    url: string | null;
    label: string;
    active: boolean;
  }[];
  next_page_url?: string | null;
  path?: string;
  per_page: number;
  prev_page_url?: string | null;
  to: number;
  total: number;
}

export interface ProcessExportHistoryMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/** Query params: historial por organización */
export interface OrganizationProcessExportHistoryQuery {
  page?: number;
  per_page?: number;
  status?: string;
  created_at_from?: string;
  created_at_to?: string;
}

/** Query params: historial global */
export interface GlobalProcessExportHistoryQuery extends OrganizationProcessExportHistoryQuery {
  organization?: string;
  organization_id?: string;
}
