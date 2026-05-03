/**
 * POST /judicial-sync — disparo de sincronización con Rama Judicial vía colas
 */
export interface JudicialSyncDispatchRequest {
  radicado: string;
}

export interface JudicialSyncDispatchResponse {
  jobs_dispatched: number;
  batch_dispatched: boolean;
  radicado_filter: string | null;
}

export interface JudicialSyncRun {
  id: string;
  /** ISO o cadena ya localizada/formateada desde el backend. */
  started_at: string;
  command_finished_at: string | null;
  batch_finished_at: string | null;
  radicado_filter: string | null;
  processes_queued: number;
  laravel_batch_id: string;
  /** Slug estable para reglas/lógica (ej. batch_completed). */
  status: string;
  /** Etiqueta lista para UI (traducida en backend). */
  status_label?: string | null;
  command_exit_code: number | null;
  dispatch_error: string | null;
  failed_jobs_count: number;
  queue_pending_jobs: number;
  moment_of_day: string;
  /** ISO o cadena ya localizada/formateada desde el backend. */
  created_at: string;
  updated_at: string;
}

export interface JudicialSyncRunsResponse {
  current_page: number;
  data: JudicialSyncRun[];
  first_page_url?: string;
  last_page: number;
  path?: string;
  per_page: number;
  total: number;
  from?: number | null;
  to?: number | null;
}
