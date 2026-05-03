import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ProcessImportHistoryItem,
  ProcessImportHistoryMeta,
  ProcessImportHistoryQuery,
} from '@app/core/models/process/process-import-history.model';
import { ProcessImportHistoryService } from '@app/core/services/process/process-import-history.service';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-import-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ProcessNumberPipe, DateRangePickerComponent],
  templateUrl: './import-history.component.html',
  styleUrl: './import-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportHistoryComponent implements OnInit, OnDestroy {
  readonly filtersSectionDomId = 'import-history-search-filters';

  /** Resaltado tras `?import=` (p. ej. click en notificación): animación larga + mismo tiempo hasta quitar clase */
  private static readonly _IMPORT_ROW_HIGHLIGHT_MS = 24_000;

  private _service = inject(ProcessImportHistoryService);
  private _activatedRoute = inject(ActivatedRoute);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);
  private _queryParamsSubscription?: { unsubscribe: () => void };
  private _highlightTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Panel de filtros (mismo patrón que procesos) */
  public showFilters = signal<boolean>(false);

  public loading = signal<boolean>(false);
  public importItems = signal<ProcessImportHistoryItem[]>([]);
  public pagination = signal<ProcessImportHistoryMeta | null>(null);
  public expandedIds = signal<Set<string>>(new Set());
  public copiedMessage = signal<string | null>(null);
  public hoveredRowId = signal<string | null>(null);
  public highlightedImportId = signal<string | null>(null);
  /** Tamaño de página (pie de tabla, mismo patrón que gestión de procesos) */
  public currentPerPage = signal<number>(10);
  /** Modal: ítem cuyos errores se muestran */
  public errorsModalItem = signal<ProcessImportHistoryItem | null>(null);

  /** Opciones de «por página» alineadas con `ProcessesComponent.pageSizeOptions` */
  public readonly pageSizeOptions = [10, 20, 25, 50, 100] as const;

  public readonly filterForm = new FormGroup({
    organization: new FormControl('', { nonNullable: true }),
    file_name: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    has_errors: new FormControl<'all' | 'yes' | 'no'>('all', { nonNullable: true }),
    created_at_range: new FormControl<DateRange | null>(null),
  });

  public summary = computed(() => {
    const items = this.importItems();
    return items.reduce(
      (acc, item) => {
        acc.imports += 1;
        acc.total += item.total_count ?? item.actions_count ?? 0;
        acc.success += item.success_count ?? 0;
        acc.failed += item.failed_count ?? 0;
        return acc;
      },
      { imports: 0, total: 0, success: 0, failed: 0 }
    );
  });

  constructor() {
    this.loadHistory();
  }

  ngOnInit(): void {
    this._queryParamsSubscription = this._activatedRoute.queryParamMap.subscribe(() => {
      this._reconcileImportQueryParam();
    });
  }

  ngOnDestroy(): void {
    this._queryParamsSubscription?.unsubscribe();
    if (this._highlightTimeoutId != null) {
      clearTimeout(this._highlightTimeoutId);
      this._highlightTimeoutId = null;
    }
  }

  errorsCount(item: ProcessImportHistoryItem): number {
    return item.errors?.length ?? 0;
  }

  openErrorsModal(item: ProcessImportHistoryItem, event?: Event): void {
    event?.stopPropagation();
    if (this.errorsCount(item) === 0) return;
    this.errorsModalItem.set(item);
  }

  closeErrorsModal(): void {
    this.errorsModalItem.set(null);
  }

  /**
   * Errores de BD / SQL vs mensajes de negocio (texto legible).
   */
  isTechnicalErrorReason(reason: string | null | undefined): boolean {
    const r = (reason || '').toUpperCase();
    return (
      r.includes('SQLSTATE') ||
      r.includes('SQL:') ||
      r.includes('MYSQL') ||
      r.includes('MARIADB') ||
      r.includes('INTEGRITY CONSTRAINT') ||
      r.includes('INSERT INTO') ||
      r.includes('DEADLOCK') ||
      r.includes('CONNECTION:')
    );
  }

  loadHistory(page: number = 1): void {
    const query = this._buildQuery(page);
    this.loading.set(true);

    this._service.getHistory(query).subscribe({
      next: (response) => {
        this.importItems.set(response.data || []);
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
        this._reconcileImportQueryParam();
      },
      error: (error) => {
        console.error('Error cargando historial de importaciones:', error);
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.loadHistory(1);
  }

  toggleFilters(): void {
    const wasOpen = this.showFilters();
    this.showFilters.update((value) => !value);

    if (wasOpen) {
      return;
    }

    afterNextRender(
      () => {
        this._document.getElementById(this.filtersSectionDomId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { injector: this._injector },
    );
  }

  resetFilters(): void {
    this.filterForm.reset({
      organization: '',
      file_name: '',
      status: '',
      has_errors: 'all',
      created_at_range: null,
    });
    this.loadHistory(1);
  }

  /** Paginación desde la tabla (incl. cambio de tamaño de página), igual que procesos */
  onPageChangeFromTable(page: number, perPage: number): void {
    this.currentPerPage.set(perPage);
    this.loadHistory(page);
  }

  toggleExpand(itemId: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    this.expandedIds.set(next);
  }

  isExpanded(itemId: string): boolean {
    return this.expandedIds().has(itemId);
  }

  getStatusClass(status: string | null | undefined): string {
    if (status === 'completed') return 'badge-success';
    if (status === 'processing') return 'badge-warning';
    if (status === 'failed') return 'badge-error';
    return 'badge-neutral';
  }

  /**
   * Modal errores: filas del Excel cuando el backend envía `excel_rows` / `rows_in_excel`;
   * si no, mismo criterio que la columna "Total" de la tabla (`total_count`/`actions_count`).
   */
  importModalExcelRowsCount(item: ProcessImportHistoryItem): number {
    const explicit = item.excel_rows ?? item.rows_in_excel ?? item.excel_row_count;
    if (explicit != null && Number.isFinite(explicit)) {
      return explicit;
    }
    return item.total_count ?? item.actions_count ?? 0;
  }

  importModalShowsExcelRowsFallbackHint(item: ProcessImportHistoryItem): boolean {
    return item.excel_rows == null && item.rows_in_excel == null && item.excel_row_count == null;
  }

  getDisplayName(item: ProcessImportHistoryItem): string {
    const fileName = item.file_name?.trim();
    if (fileName) return fileName;

    const date = item.date?.trim();
    const time = item.time?.trim();
    if (date && time) return `${date} ${time}`;
    if (date) return date;
    return item.id;
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

  copyToClipboard(text: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!text) return;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.copiedMessage.set('historialImportaciones.copied');
        setTimeout(() => this.copiedMessage.set(null), 2000);
      })
      .catch((error) => {
        console.error('No se pudo copiar:', error);
      });
  }

  /**
   * Deep link `?import=<uuid>`: resaltar si el lote está en la tabla actual;
   * si no y ya no hay carga activa, buscar en páginas (consulta ligera sin filtros del formulario).
   */
  private _reconcileImportQueryParam(): void {
    const importId = this._activatedRoute.snapshot.queryParamMap.get('import');
    if (!importId) return;

    if (this.importItems().some((item) => item.id === importId)) {
      this._highlightImportRow(importId);
      return;
    }

    if (this.loading()) {
      return;
    }

    void this._loadPageContainingImport(importId);
  }

  private async _loadPageContainingImport(importId: string): Promise<void> {
    try {
      const firstPage = await firstValueFrom(this._service.getHistory(this._buildQuery(1, { bare: true })));
      if (firstPage?.data?.some((item) => item.id === importId)) {
        this._applyHistoryResponse(firstPage);
        this._highlightImportRow(importId);
        return;
      }

      const lastPage = Math.max(1, firstPage?.last_page ?? 1);
      for (let page = 2; page <= lastPage; page += 1) {
        const response = await firstValueFrom(this._service.getHistory(this._buildQuery(page, { bare: true })));
        if (response?.data?.some((item) => item.id === importId)) {
          this._applyHistoryResponse(response);
          this._highlightImportRow(importId);
          return;
        }
      }
    } catch (error) {
      console.error('Error buscando importación por id:', error);
    }
  }

  /**
   * @param bare Solo paginación (p. ej. búsqueda por ?import= sin aplicar filtros del formulario).
   */
  private _buildQuery(page: number, options?: { bare?: boolean }): ProcessImportHistoryQuery {
    const raw = this.filterForm.getRawValue();
    const perPageNum = Number(this.currentPerPage());
    const per_page = Number.isFinite(perPageNum) && perPageNum > 0 ? perPageNum : 10;

    const query: ProcessImportHistoryQuery = {
      page,
      per_page,
    };

    if (options?.bare) {
      return query;
    }

    const organization = raw.organization?.trim();
    if (organization) query.organization = organization;

    const file_name = raw.file_name?.trim();
    if (file_name) query.file_name = file_name;

    const status = raw.status?.trim();
    if (status) query.status = status;

    if (raw.has_errors === 'yes') query.has_errors = true;
    if (raw.has_errors === 'no') query.has_errors = false;

    const range = raw.created_at_range;
    const created_at_from = range?.from?.trim();
    if (created_at_from) query.created_at_from = created_at_from;

    const created_at_to = range?.to?.trim();
    if (created_at_to) query.created_at_to = created_at_to;

    return query;
  }

  private _applyHistoryResponse(response: {
    data: ProcessImportHistoryItem[];
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number;
    to: number;
  }): void {
    this.importItems.set(response.data || []);
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

  private _highlightImportRow(importId: string): void {
    this.highlightedImportId.set(importId);
    if (this._highlightTimeoutId != null) {
      clearTimeout(this._highlightTimeoutId);
    }

    afterNextRender(
      () => {
        const el = this._document.querySelector(`[data-import-id="${CSS.escape(importId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      { injector: this._injector },
    );

    this._highlightTimeoutId = setTimeout(() => {
      this.highlightedImportId.set(null);
      this._highlightTimeoutId = null;
    }, ImportHistoryComponent._IMPORT_ROW_HIGHLIGHT_MS);
  }
}
