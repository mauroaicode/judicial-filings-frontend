/**
 * POST /judicial-sync — disparo de sincronización vía colas
 * (judicial_branch → cola judicial-sync, samai → cola samai-sync).
 */
export type JudicialSyncDataSource = 'judicial_branch' | 'samai' | 'tyba';

/** Fuentes que se pueden disparar desde el POST (tyba no es ejecutable). */
export type JudicialSyncDispatchableSource = Extract<JudicialSyncDataSource, 'judicial_branch' | 'samai'>;

export interface JudicialSyncDispatchRequest {
  radicado?: string;
  data_source?: JudicialSyncDispatchableSource;
}

export interface JudicialSyncDispatchResponse {
  jobs_dispatched: number;
  batch_dispatched: boolean;
  radicado_filter: string | null;
  data_source: JudicialSyncDispatchableSource;
  data_source_label: string;
}

export interface JudicialSyncRun {
  id: string;
  data_source: JudicialSyncDataSource | string;
  data_source_label?: string | null;
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

export interface JudicialSyncRunsQuery {
  page?: number;
  per_page?: number;
  data_source?: JudicialSyncDataSource | '';
  status?: string;
  started_at_from?: string;
  started_at_to?: string;
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

/**
 * GET /judicial-sync/status — snapshot de fuentes en curso (banner del header).
 * `active` trae solo las entradas con `is_active: true`.
 */
export interface JudicialSyncLiveSource {
  data_source: string;
  data_source_label: string;
  is_active: boolean;
  is_executable: boolean;
  run_id: string | null;
  status: string | null;
  status_label: string | null;
  processes_queued: number;
  /** Procesos que faltan. `null` mientras el batch aún se prepara. */
  queue_pending_jobs: number | null;
  failed_jobs_count: number | null;
  laravel_batch_id: string | null;
  started_at: string | null;
  radicado_filter: string | null;
}

export interface JudicialSyncLiveStatusResponse {
  has_active: boolean;
  active_count: number;
  sources: JudicialSyncLiveSource[];
  active: JudicialSyncLiveSource[];
}

/**
 * Echo `.JudicialSyncStatusUpdated` en el canal privado `admin.judicial-sync`.
 */
export interface JudicialSyncStatusUpdatedEvent {
  run_id: string | null;
  data_source: string;
  data_source_label: string;
  status: string | null;
  status_label: string | null;
  is_active: boolean;
  processes_queued: number;
  queue_pending_jobs: number | null;
  failed_jobs_count: number | null;
  laravel_batch_id: string | null;
  started_at: string | null;
}
