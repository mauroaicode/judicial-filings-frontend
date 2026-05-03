export interface ProcessImportHistoryError {
  process_number: string;
  reason: string;
}

export interface ProcessImportHistoryItem {
  id: string;
  organization_id?: string;
  organization_name?: string | null;
  file_name?: string | null;
  total_count?: number | null;
  success_count?: number | null;
  failed_count?: number | null;
  multiple_instances_count?: number | null;
  /** Filas leídas del Excel (cuando el API las envía; nombres según serialización del backend) */
  excel_rows?: number | null;
  rows_in_excel?: number | null;
  excel_row_count?: number | null;
  status?: string | null;
  status_label?: string | null;
  enqueued_process_numbers?: string[] | null;
  errors?: ProcessImportHistoryError[] | null;
  completed_at?: string | null;
  created_at?: string | null;

  date?: string | null;
  time?: string | null;
  period?: string | null;
  actions_count?: number | null;
}

export interface ProcessImportHistoryResponse {
  current_page: number;
  data: ProcessImportHistoryItem[];
  first_page_url: string;
  from: number;
  last_page: number;
  last_page_url: string;
  links: {
    url: string | null;
    label: string;
    active: boolean;
  }[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number;
  total: number;
}

export interface ProcessImportHistoryMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/** Query params soportados por GET /processes/import-history */
export interface ProcessImportHistoryQuery {
  page?: number;
  per_page?: number;
  organization?: string;
  file_name?: string;
  /** Exacto: processing | completed | failed */
  status?: string;
  /** true / false (API acepta también 1/0) */
  has_errors?: boolean;
  /** Y-m-d */
  created_at_from?: string;
  /** Y-m-d */
  created_at_to?: string;
}
