import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  Injector,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ProcessExportFilters,
  ProcessExportHistoryMeta,
  ProcessExportItem,
} from '@app/core/models/process/process-export.model';
import { ProcessExportService } from '@app/core/services/process/process-export.service';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { ProcessExportModalComponent } from '../clients/components/process-export-modal/process-export-modal.component';

@Component({
  selector: 'app-export-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslocoPipe,
    RouterLink,
    DateRangePickerComponent,
    ProcessExportModalComponent,
  ],
  templateUrl: './export-history.component.html',
  styleUrl: './export-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportHistoryComponent implements OnInit, OnDestroy {
  readonly filtersSectionDomId = 'export-history-search-filters';

  private static readonly _EXPORT_ROW_HIGHLIGHT_MS = 24_000;

  private _service = inject(ProcessExportService);
  private _activatedRoute = inject(ActivatedRoute);
  private _router = inject(Router);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);
  private _queryParamsSubscription?: { unsubscribe: () => void };
  private _highlightTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Organización fija cuando la ruta es `/admin/organizations/:id/exports` */
  public organizationId = signal<string | null>(null);
  public organizationName = signal<string | null>(null);

  public showFilters = signal(false);
  public loading = signal(false);
  public exportItems = signal<ProcessExportItem[]>([]);
  public pagination = signal<ProcessExportHistoryMeta | null>(null);
  public currentPerPage = signal(15);
  public highlightedExportId = signal<string | null>(null);
  public errorModalItem = signal<ProcessExportItem | null>(null);
  public toastMessage = signal<string | null>(null);
  public toastKind = signal<'success' | 'error'>('success');
  public downloadingIds = signal<Set<string>>(new Set());
  public rerunningIds = signal<Set<string>>(new Set());
  public exportModalOpen = signal(false);

  public readonly pageSizeOptions = [10, 15, 20, 25, 50, 100] as const;

  public readonly filterForm = new FormGroup({
    organization: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    created_at_range: new FormControl<DateRange | null>(null),
  });

  public get isOrgScoped(): boolean {
    return !!this.organizationId();
  }

  constructor() {
    const orgId = this._activatedRoute.snapshot.paramMap.get('organizationId');
    this.organizationId.set(orgId);
    this.loadHistory(1);

    let seenRevision = this._service.historyRevision();
    effect(() => {
      const rev = this._service.historyRevision();
      if (rev === seenRevision) {
        return;
      }
      seenRevision = rev;
      this.loadHistory(1);
    });
  }

  ngOnInit(): void {
    this._queryParamsSubscription = this._activatedRoute.queryParamMap.subscribe(() => {
      this._reconcileExportQueryParam();
    });
  }

  ngOnDestroy(): void {
    this._queryParamsSubscription?.unsubscribe();
    if (this._highlightTimeoutId != null) clearTimeout(this._highlightTimeoutId);
    if (this._toastTimeoutId != null) clearTimeout(this._toastTimeoutId);
  }

  loadHistory(page: number = 1): void {
    this.loading.set(true);
    const query = this._buildQuery(page);
    const orgId = this.organizationId();

    const request$ = orgId
      ? this._service.getOrganizationHistory(orgId, query)
      : this._service.getGlobalHistory(query);

    request$.subscribe({
      next: (response) => {
        this.exportItems.set(response.data || []);
        this.pagination.set({
          current_page: response.current_page,
          per_page: response.per_page,
          total: response.total,
          last_page: response.last_page,
          from: response.from,
          to: response.to,
        });
        this.currentPerPage.set(response.per_page);
        if (orgId && !this.organizationName()) {
          const name = response.data?.[0]?.organization_name;
          if (name) this.organizationName.set(name);
        }
        this.loading.set(false);
        this._reconcileExportQueryParam();
      },
      error: (error) => {
        console.error('Error cargando historial de exportaciones:', error);
        this.loading.set(false);
        this._showToast(this._transloco.translate('historialExportaciones.errors.load'), 'error');
      },
    });
  }

  applyFilters(): void {
    this.loadHistory(1);
  }

  toggleFilters(): void {
    const wasOpen = this.showFilters();
    this.showFilters.update((v) => !v);
    if (wasOpen) return;
    afterNextRender(
      () => {
        this._document.getElementById(this.filtersSectionDomId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { injector: this._injector }
    );
  }

  resetFilters(): void {
    this.filterForm.reset({
      organization: '',
      status: '',
      created_at_range: null,
    });
    this.loadHistory(1);
  }

  onPageChangeFromTable(page: number, perPage: number): void {
    this.currentPerPage.set(perPage);
    this.loadHistory(page);
  }

  getPageNumbers(): number[] {
    const pagination = this.pagination();
    if (!pagination) return [];
    const current = pagination.current_page;
    const last = pagination.last_page;
    const pages: number[] = [];
    let start = Math.max(1, current - 2);
    let end = Math.min(last, current + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(last, start + 4);
      if (start !== 1) start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }

  getStatusClass(status: string | null | undefined): string {
    if (status === 'completed') return 'badge-success';
    if (status === 'processing') return 'badge-warning';
    if (status === 'pending') return 'badge-info';
    if (status === 'failed') return 'badge-error';
    return 'badge-neutral';
  }

  statusLabel(item: ProcessExportItem | string | null | undefined): string {
    if (item && typeof item === 'object') {
      const label = item.status_label?.trim();
      if (label) return label;
      return this.statusLabel(item.status);
    }
    const status = item;
    const key = status ? `historialExportaciones.status.${status}` : 'historialExportaciones.status.unknown';
    const translated = this._transloco.translate(key);
    return translated === key ? (status || this._transloco.translate('historialExportaciones.status.unknown')) : translated;
  }

  /**
   * Fechas humanas del backend (DateFormatHelper) se muestran tal cual;
   * si llega ISO, se formatea localmente.
   */
  formatDate(value: string | null | undefined): string {
    if (!value) return '–';
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !trimmed.includes('T')) {
      return trimmed;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return trimmed;
    return date.toLocaleString();
  }

  filterChips(filters: ProcessExportFilters | null | undefined): string[] {
    if (!filters) return [];
    const chips: string[] = [];

    if (filters.status) {
      chips.push(this._transloco.translate(`historialExportaciones.modal.status${this._capitalize(filters.status)}`));
    }
    if (filters.created_at_from || filters.created_at_to) {
      chips.push(
        this._transloco.translate('historialExportaciones.chips.createdRange', {
          from: filters.created_at_from || '…',
          to: filters.created_at_to || '…',
        })
      );
    }
    if (filters.updated_at_from || filters.updated_at_to) {
      chips.push(
        this._transloco.translate('historialExportaciones.chips.updatedRange', {
          from: filters.updated_at_from || '…',
          to: filters.updated_at_to || '…',
        })
      );
    }
    if (filters.include_plaintiffs) {
      chips.push(this._transloco.translate('historialExportaciones.chips.plaintiffs'));
    }
    if (filters.include_defendants) {
      chips.push(this._transloco.translate('historialExportaciones.chips.defendants'));
    }
    if (filters.include_other_subjects) {
      chips.push(this._transloco.translate('historialExportaciones.chips.otherSubjects'));
    }
    if (filters.include_actions) {
      if (filters.actions_from || filters.actions_to) {
        chips.push(
          this._transloco.translate('historialExportaciones.chips.actionsRange', {
            from: filters.actions_from || '…',
            to: filters.actions_to || '…',
          })
        );
      } else {
        chips.push(this._transloco.translate('historialExportaciones.chips.actionsAll'));
      }
    }
    return chips;
  }

  openExportModal(): void {
    if (!this.organizationId()) return;
    this.exportModalOpen.set(true);
  }

  closeExportModal(): void {
    this.exportModalOpen.set(false);
  }

  onExportQueued(event: { item: ProcessExportItem; message: string }): void {
    this.closeExportModal();
    this._showToast(this._transloco.translate('historialExportaciones.toast.queued'), 'success');
    this.loadHistory(1);
  }

  download(item: ProcessExportItem, event?: Event): void {
    event?.stopPropagation();
    if (!item.downloadable || this.downloadingIds().has(item.id)) return;

    this.downloadingIds.update((set) => new Set(set).add(item.id));
    this._service.downloadAndSave(item).subscribe({
      next: () => {
        this._removeDownloading(item.id);
        this._showToast(this._transloco.translate('historialExportaciones.toast.downloaded'), 'success');
      },
      error: () => {
        this._removeDownloading(item.id);
        this._showToast(this._transloco.translate('historialExportaciones.errors.download'), 'error');
      },
    });
  }

  rerun(item: ProcessExportItem, event?: Event): void {
    event?.stopPropagation();
    if (!item.can_rerun || this.rerunningIds().has(item.id)) return;

    this.rerunningIds.update((set) => new Set(set).add(item.id));
    this._service.rerun(item.organization_id, item.id).subscribe({
      next: (response) => {
        this._removeRerunning(item.id);
        this._showToast(this._transloco.translate('historialExportaciones.toast.rerunQueued'), 'success');
        this.loadHistory(1);
      },
      error: () => {
        this._removeRerunning(item.id);
        this._showToast(this._transloco.translate('historialExportaciones.errors.rerun'), 'error');
      },
    });
  }

  openErrorModal(item: ProcessExportItem, event?: Event): void {
    event?.stopPropagation();
    if (!item.error_message) return;
    this.errorModalItem.set(item);
  }

  closeErrorModal(): void {
    this.errorModalItem.set(null);
  }

  isDownloading(id: string): boolean {
    return this.downloadingIds().has(id);
  }

  isRerunning(id: string): boolean {
    return this.rerunningIds().has(id);
  }

  goToOrganizations(): void {
    void this._router.navigate(['/admin/organizations']);
  }

  private _buildQuery(page: number, options?: { bare?: boolean }) {
    const raw = this.filterForm.getRawValue();
    const perPageNum = Number(this.currentPerPage());
    const per_page = Number.isFinite(perPageNum) && perPageNum > 0 ? perPageNum : 15;

    const query: {
      page: number;
      per_page: number;
      organization?: string;
      status?: string;
      created_at_from?: string;
      created_at_to?: string;
    } = { page, per_page };

    if (options?.bare) return query;

    if (!this.isOrgScoped) {
      const organization = raw.organization?.trim();
      if (organization) query.organization = organization;
    }

    const status = raw.status?.trim();
    if (status) query.status = status;

    const range = raw.created_at_range;
    if (range?.from?.trim()) query.created_at_from = range.from.trim();
    if (range?.to?.trim()) query.created_at_to = range.to.trim();

    return query;
  }

  private _reconcileExportQueryParam(): void {
    const exportId = this._activatedRoute.snapshot.queryParamMap.get('export');
    if (!exportId) return;

    if (this.exportItems().some((item) => item.id === exportId)) {
      this._highlightExportRow(exportId);
      return;
    }

    if (this.loading()) return;
    void this._loadPageContainingExport(exportId);
  }

  private async _loadPageContainingExport(exportId: string): Promise<void> {
    try {
      const orgId = this.organizationId();
      const fetchPage = (page: number) => {
        const query = this._buildQuery(page, { bare: true });
        return orgId
          ? firstValueFrom(this._service.getOrganizationHistory(orgId, query))
          : firstValueFrom(this._service.getGlobalHistory(query));
      };

      const firstPage = await fetchPage(1);
      if (firstPage?.data?.some((item) => item.id === exportId)) {
        this._applyHistoryResponse(firstPage);
        this._highlightExportRow(exportId);
        return;
      }

      const lastPage = Math.max(1, firstPage?.last_page ?? 1);
      for (let page = 2; page <= lastPage; page += 1) {
        const response = await fetchPage(page);
        if (response?.data?.some((item) => item.id === exportId)) {
          this._applyHistoryResponse(response);
          this._highlightExportRow(exportId);
          return;
        }
      }
    } catch (error) {
      console.error('Error buscando exportación por id:', error);
    }
  }

  private _applyHistoryResponse(response: {
    data: ProcessExportItem[];
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number;
    to: number;
  }): void {
    this.exportItems.set(response.data || []);
    this.pagination.set({
      current_page: response.current_page,
      per_page: response.per_page,
      total: response.total,
      last_page: response.last_page,
      from: response.from,
      to: response.to,
    });
    this.currentPerPage.set(response.per_page);
    this.loading.set(false);
  }

  private _highlightExportRow(exportId: string): void {
    this.highlightedExportId.set(exportId);
    if (this._highlightTimeoutId != null) clearTimeout(this._highlightTimeoutId);

    afterNextRender(
      () => {
        const el = this._document.querySelector(`[data-export-id="${CSS.escape(exportId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      { injector: this._injector }
    );

    this._highlightTimeoutId = setTimeout(() => {
      this.highlightedExportId.set(null);
      this._highlightTimeoutId = null;
    }, ExportHistoryComponent._EXPORT_ROW_HIGHLIGHT_MS);
  }

  private _showToast(message: string, kind: 'success' | 'error'): void {
    this.toastKind.set(kind);
    this.toastMessage.set(message);
    if (this._toastTimeoutId != null) clearTimeout(this._toastTimeoutId);
    this._toastTimeoutId = setTimeout(() => {
      this.toastMessage.set(null);
      this._toastTimeoutId = null;
    }, 4000);
  }

  private _removeDownloading(id: string): void {
    this.downloadingIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  private _removeRerunning(id: string): void {
    this.rerunningIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  private _capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
