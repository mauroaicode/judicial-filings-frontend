import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { JudicialSyncLiveService } from '@app/core/services/judicial-sync/judicial-sync-live.service';
import { JudicialSyncService } from '@app/core/services/judicial-sync/judicial-sync.service';
import {
  JudicialSyncDataSource,
  JudicialSyncDispatchableSource,
  JudicialSyncLiveSource,
  JudicialSyncRun,
  JudicialSyncStatusUpdatedEvent,
} from '@app/core/models/judicial-sync/judicial-sync.model';
import { ConfirmationDialogComponent, ConfirmationDialogDetailRow } from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';

const PER_PAGE = 15;

function radicadoOptional(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 23) return { radicadoFormat: true };
  return null;
}

@Component({
  selector: 'app-judicial-sync',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ConfirmationDialogComponent, ProcessNumberPipe],
  templateUrl: './judicial-sync.component.html',
  styleUrls: ['./judicial-sync.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudicialSyncComponent {
  private _fb = inject(FormBuilder);
  private _judicialSync = inject(JudicialSyncService);
  private _liveSync = inject(JudicialSyncLiveService);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);
  private _injector = inject(Injector);

  loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMoreSentinel');

  public runs = signal<JudicialSyncRun[]>([]);
  public initialLoading = signal<boolean>(true);
  public loadingMore = signal<boolean>(false);
  public loadError = signal<boolean>(false);

  /** Fuentes en cola de envío (pueden ir en paralelo). */
  public submittingJudicial = signal<boolean>(false);
  public submittingSamai = signal<boolean>(false);

  public currentPage = signal<number>(1);
  public lastPage = signal<number>(1);

  /** Filtro del historial: '' = todas las fuentes. */
  public historyDataSource = signal<'' | JudicialSyncDataSource>('');

  public confirmDispatchOpen = signal<boolean>(false);
  public pendingDataSource = signal<JudicialSyncDispatchableSource | null>(null);
  public toastMessage = signal<string | null>(null);

  /** Body normalizado solo dígitos (23) para POST */
  dispatchForm = this._fb.group({
    radicado: ['', [Validators.maxLength(64), radicadoOptional]],
  });

  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _intersectionObserver: IntersectionObserver | null = null;
  /** Runs currently pintados con el snapshot/WS, para no revertir el countdown al HTTP viejo. */
  private _liveMatchedKeys = new Set<string>();

  constructor() {
    this.reloadRuns(true);

    effect(
      () => {
        this._liveSync.runLiveTick();
        const live = this._liveSync.activeSources();
        const terminals = this._liveSync.terminalEvents();
        untracked(() => {
          this.runs.update((runs) => this._applyLiveProgress(runs, live, terminals));
        });
      },
      { injector: this._injector },
    );

    effect(
      () => {
        const el = this.loadMoreSentinel()?.nativeElement;
        this._intersectionObserver?.disconnect();
        this._intersectionObserver = null;
        if (!el) return;

        this._intersectionObserver = new IntersectionObserver(
          (entries) => {
            if (!entries[0]?.isIntersecting) return;
            this.loadMoreIfNeeded();
          },
          { root: null, rootMargin: '240px', threshold: 0 },
        );
        this._intersectionObserver.observe(el);
      },
      { injector: this._injector },
    );

    this._destroyRef.onDestroy(() => {
      this._intersectionObserver?.disconnect();
      if (this._toastTimer != null) {
        clearTimeout(this._toastTimer);
      }
    });
  }

  isSubmitting(source: JudicialSyncDispatchableSource): boolean {
    return source === 'judicial_branch' ? this.submittingJudicial() : this.submittingSamai();
  }

  openDispatchConfirm(source: JudicialSyncDispatchableSource): void {
    if (this.dispatchForm.invalid) {
      this.dispatchForm.markAllAsTouched();
      return;
    }
    if (this.isSubmitting(source)) return;
    this.pendingDataSource.set(source);
    this.confirmDispatchOpen.set(true);
  }

  cancelDispatchConfirm(): void {
    this.confirmDispatchOpen.set(false);
    this.pendingDataSource.set(null);
  }

  dataSourceLabel(source: string | null | undefined): string {
    const s = String(source ?? '').toLowerCase();
    if (s === 'samai') return this._transloco.translate('judicialSync.dataSource.samai');
    if (s === 'tyba') return this._transloco.translate('judicialSync.dataSource.tyba');
    if (s === 'judicial_branch') return this._transloco.translate('judicialSync.dataSource.judicialBranch');
    return source?.trim() || '–';
  }

  getConfirmDetailRows(): ConfirmationDialogDetailRow[] {
    const source = this.pendingDataSource();
    const rows: ConfirmationDialogDetailRow[] = [
      {
        label: this._transloco.translate('judicialSync.confirm.dataSourceLabel'),
        value: this.dataSourceLabel(source),
      },
    ];

    const raw = String(this.dispatchForm.get('radicado')?.value ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 23) {
      rows.push({
        label: this._transloco.translate('judicialSync.confirm.radicadoLabel'),
        value: digits,
      });
    } else {
      rows.push({
        label: this._transloco.translate('judicialSync.confirm.scopeLabel'),
        value: this._transloco.translate('judicialSync.confirm.scopeAll'),
      });
    }
    return rows;
  }

  onConfirmDispatch(): void {
    const source = this.pendingDataSource();
    this.confirmDispatchOpen.set(false);
    this.pendingDataSource.set(null);
    if (!source) return;

    const digits = String(this.dispatchForm.get('radicado')?.value ?? '')
      .trim()
      .replace(/\D/g, '');
    const radicadoPayload = digits.length === 23 ? digits : '';

    this._setSubmitting(source, true);
    this._judicialSync.dispatchSync({ radicado: radicadoPayload, data_source: source }).subscribe({
      next: (res) => {
        this._setSubmitting(source, false);
        const label = res.data_source_label?.trim() || this.dataSourceLabel(res.data_source);
        const msg = this._transloco.translate('judicialSync.toastSuccess', {
          jobs: String(res.jobs_dispatched),
          source: label,
        });
        this.showToast(msg);
        this.reloadRuns(true);
        this._liveSync.scheduleRefresh();
      },
      error: () => {
        this._setSubmitting(source, false);
        this.showToast(this._transloco.translate('judicialSync.toastError'));
      },
    });
  }

  setHistoryDataSource(value: '' | JudicialSyncDataSource): void {
    if (this.historyDataSource() === value) return;
    this.historyDataSource.set(value);
    this.reloadRuns(true);
  }

  reloadRuns(reset: boolean): void {
    if (reset) {
      this.initialLoading.set(true);
      this.loadError.set(false);
      this.currentPage.set(1);
    }

    this._judicialSync
      .getRuns({
        page: reset ? 1 : this.currentPage(),
        per_page: PER_PAGE,
        data_source: this.historyDataSource() || undefined,
      })
      .subscribe({
        next: (response) => {
          const live = this._liveSync.activeSources();
          const terminals = this._liveSync.terminalEvents();
          if (reset) {
            this.runs.set(this._applyLiveProgress(response.data, live, terminals));
          } else {
            this.runs.update((prev) => this._applyLiveProgress([...prev, ...response.data], live, terminals));
          }
          this.currentPage.set(response.current_page);
          this.lastPage.set(response.last_page);
          this.initialLoading.set(false);
          this.loadingMore.set(false);
        },
        error: () => {
          this.initialLoading.set(false);
          this.loadingMore.set(false);
          if (reset) {
            this.loadError.set(true);
          }
        },
      });
  }

  loadMoreIfNeeded(): void {
    if (this.initialLoading() || this.loadingMore()) return;
    if (this.currentPage() >= this.lastPage()) return;

    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);

    this._judicialSync
      .getRuns({
        page: nextPage,
        per_page: PER_PAGE,
        data_source: this.historyDataSource() || undefined,
      })
      .subscribe({
        next: (response) => {
          this.runs.update((prev) =>
            this._applyLiveProgress(
              [...prev, ...response.data],
              this._liveSync.activeSources(),
              this._liveSync.terminalEvents(),
            ),
          );
          this.currentPage.set(response.current_page);
          this.lastPage.set(response.last_page);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }

  /**
   * Muestra la fecha como la envía la API si ya viene formateada; si llega ISO (compat. legado),
   * la formatea en es-CO.
   */
  formatDate(value: string | null | undefined): string {
    if (value == null) return '–';
    const s = String(value).trim();
    if (!s) return '–';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    }
    return s;
  }

  normalizedRadicado(filter: string | null | undefined): string {
    const d = String(filter ?? '').replace(/\D/g, '');
    return d.length === 23 ? d : '';
  }

  dataSourceBadgeClass(source: string | null | undefined): string {
    const s = String(source ?? '').toLowerCase();
    if (s === 'samai') return 'js-source-badge js-source-badge--samai';
    if (s === 'tyba') return 'js-source-badge js-source-badge--tyba';
    return 'js-source-badge js-source-badge--judicial';
  }

  /**
   * Colores por significado — soporta slugs (`batch_completed`) y etiquetas ya traducidas por la API.
   */
  statusBadgeClass(status: string): string {
    const s = String(status ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, '');

    if (
      s.includes('completad') ||
      s.includes('finalizad') ||
      s.includes('success') ||
      s.includes('batchcompleted')
    ) {
      return 'badge-success';
    }
    if (s.includes('fail') || s.includes('error') || s.includes('fallid') || s.includes('cancelad')) {
      return 'badge-error';
    }
    if (
      s.includes('pending') ||
      s.includes('pendiente') ||
      s.includes('running') ||
      s.includes('progress') ||
      s.includes('encolad') ||
      s.includes('curso') ||
      s.includes('procesando') ||
      s.includes('ejecutando') ||
      s.includes('dispatched') ||
      s.includes('batchpending')
    ) {
      return 'badge-warning';
    }
    return 'badge-neutral';
  }

  momentTranslocoKey(moment: string | null | undefined): string {
    const m = String(moment ?? '')
      .toLowerCase()
      .trim()
      .replace(/ñ/g, 'n')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (m === 'manana') return 'judicialSync.moment.morning';
    if (m === 'tarde') return 'judicialSync.moment.afternoon';
    if (m === 'noche') return 'judicialSync.moment.night';
    if (m.includes('madrug')) return 'judicialSync.moment.dawn';
    return 'judicialSync.moment.other';
  }

  /**
   * El historial sale de GET /runs (estático). El countdown usa el mismo snapshot/WS del banner.
   */
  private _applyLiveProgress(
    runs: JudicialSyncRun[],
    live: JudicialSyncLiveSource[],
    terminals: Record<string, JudicialSyncStatusUpdatedEvent>,
  ): JudicialSyncRun[] {
    if (runs.length === 0) {
      this._liveMatchedKeys = new Set();
      return runs;
    }

    const claimed = new Set<string>();
    const nowKeys = new Set<string>();
    let changed = false;

    let next = runs.map((run) => {
      const src = this._liveSourceForRun(run, live, claimed);
      if (!src) return run;

      claimed.add(src.data_source);
      if (run.id) nowKeys.add(run.id);
      if (run.laravel_batch_id) nowKeys.add(run.laravel_batch_id);

      const patched = this._patchRunFromLiveSource(run, src);
      if (patched !== run) changed = true;
      return patched;
    });

    const finishedKeys = [...this._liveMatchedKeys].filter((key) => !nowKeys.has(key));
    this._liveMatchedKeys = nowKeys;

    if (finishedKeys.length > 0) {
      next = next.map((run) => {
        const finished =
          (!!run.id && finishedKeys.includes(run.id)) ||
          (!!run.laravel_batch_id && finishedKeys.includes(run.laravel_batch_id));
        if (!finished || run.queue_pending_jobs === 0) return run;
        changed = true;
        return { ...run, queue_pending_jobs: 0 };
      });
    }

    next = next.map((run) => {
      const terminal = this._terminalEventForRun(run, terminals);
      if (!terminal) return run;
      const patched = this._patchRunFromTerminal(run, terminal);
      if (patched !== run) changed = true;
      return patched;
    });

    return changed ? next : runs;
  }

  private _patchRunFromLiveSource(run: JudicialSyncRun, src: JudicialSyncLiveSource): JudicialSyncRun {
    const queuePending =
      typeof src.queue_pending_jobs === 'number' ? src.queue_pending_jobs : run.queue_pending_jobs;
    const failedJobs =
      typeof src.failed_jobs_count === 'number' ? src.failed_jobs_count : run.failed_jobs_count;
    const queued = src.processes_queued > 0 ? src.processes_queued : run.processes_queued;
    const status = src.status || run.status;
    const statusLabel = src.status_label ?? run.status_label;
    const batchId = src.laravel_batch_id || run.laravel_batch_id;

    if (
      queuePending === run.queue_pending_jobs &&
      failedJobs === run.failed_jobs_count &&
      queued === run.processes_queued &&
      status === run.status &&
      statusLabel === run.status_label &&
      batchId === run.laravel_batch_id
    ) {
      return run;
    }

    return {
      ...run,
      queue_pending_jobs: queuePending,
      failed_jobs_count: failedJobs,
      processes_queued: queued,
      status,
      status_label: statusLabel,
      laravel_batch_id: batchId,
    };
  }

  private _patchRunFromTerminal(
    run: JudicialSyncRun,
    terminal: JudicialSyncStatusUpdatedEvent,
  ): JudicialSyncRun {
    const status = terminal.status || run.status;
    const statusLabel = terminal.status_label ?? run.status_label;
    const queuePending =
      typeof terminal.queue_pending_jobs === 'number' ? terminal.queue_pending_jobs : 0;
    const failedJobs =
      typeof terminal.failed_jobs_count === 'number' ? terminal.failed_jobs_count : run.failed_jobs_count;
    const batchId = terminal.laravel_batch_id || run.laravel_batch_id;
    const batchFinishedAt = run.batch_finished_at ?? this._formatTerminalFinishedAt(new Date());

    if (
      status === run.status &&
      statusLabel === run.status_label &&
      queuePending === run.queue_pending_jobs &&
      failedJobs === run.failed_jobs_count &&
      batchId === run.laravel_batch_id &&
      batchFinishedAt === run.batch_finished_at
    ) {
      return run;
    }

    return {
      ...run,
      status,
      status_label: statusLabel,
      queue_pending_jobs: queuePending,
      failed_jobs_count: failedJobs,
      laravel_batch_id: batchId,
      batch_finished_at: batchFinishedAt,
    };
  }

  private _formatTerminalFinishedAt(date: Date): string {
    return date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  private _terminalEventForRun(
    run: JudicialSyncRun,
    terminals: Record<string, JudicialSyncStatusUpdatedEvent>,
  ): JudicialSyncStatusUpdatedEvent | undefined {
    if (run.id && terminals[`run:${run.id}`]) {
      return terminals[`run:${run.id}`];
    }
    if (run.laravel_batch_id && terminals[`batch:${run.laravel_batch_id}`]) {
      return terminals[`batch:${run.laravel_batch_id}`];
    }
    const bySource = terminals[`source:${run.data_source}`];
    if (!bySource) return undefined;
    if (bySource.run_id && bySource.run_id !== run.id) return undefined;
    if (bySource.laravel_batch_id && run.laravel_batch_id && bySource.laravel_batch_id !== run.laravel_batch_id) {
      return undefined;
    }
    return bySource;
  }

  private _liveSourceForRun(
    run: JudicialSyncRun,
    live: JudicialSyncLiveSource[],
    claimed: Set<string>,
  ): JudicialSyncLiveSource | undefined {
    const exact = live.find(
      (src) =>
        (src.run_id != null && src.run_id === run.id) ||
        (!!src.laravel_batch_id && src.laravel_batch_id === run.laravel_batch_id),
    );
    if (exact) return exact;
    if (!this._runLooksActive(run)) return undefined;
    return live.find((src) => src.data_source === run.data_source && !claimed.has(src.data_source));
  }

  private _runLooksActive(run: JudicialSyncRun): boolean {
    if (run.queue_pending_jobs > 0) return true;
    const status = String(run.status ?? '')
      .toLowerCase()
      .replace(/_/g, '');
    return (
      status.includes('pending') ||
      status.includes('running') ||
      status.includes('encol') ||
      status.includes('curso') ||
      status.includes('batchpending') ||
      status.includes('dispatched') ||
      status.includes('procesando')
    );
  }

  private _setSubmitting(source: JudicialSyncDispatchableSource, value: boolean): void {
    if (source === 'judicial_branch') {
      this.submittingJudicial.set(value);
    } else {
      this.submittingSamai.set(value);
    }
  }

  private showToast(message: string): void {
    if (this._toastTimer != null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.toastMessage.set(message);
    this._toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
      this._toastTimer = null;
    }, 3400);
  }
}
