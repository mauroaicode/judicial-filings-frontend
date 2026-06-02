import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ProcessService } from '@app/core/services/process/process.service';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  Process,
  ProcessInstance,
  ProcessFilter,
  ProcessResponseMeta,
  ProcessImportBatchResponse,
  ProcessDashboardStats,
} from '@app/core/models/process/process.model';
import { ProcessDataSource } from '@app/core/models/process/process-data-source.model';
import { Organization } from '@app/core/models/organization/organization.model';
import { DataTableColumn } from '@app/shared/components/data-table/data-table.component';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { FileDropZoneComponent } from '@app/shared/components/file-drop-zone/file-drop-zone.component';
import { BottomSheetModalComponent } from '@app/shared/components/bottom-sheet-modal/bottom-sheet-modal.component';
import { SearchableSelectComponent } from '@app/shared/components/searchable-select/searchable-select.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-processes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    DateRangePickerComponent,
    FileDropZoneComponent,
    BottomSheetModalComponent,
    SearchableSelectComponent,
    ProcessNumberPipe,
    ConfirmationDialogComponent,
  ],
  templateUrl: './processes.component.html',
  styleUrls: ['./processes.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessesComponent {
  readonly filtersSectionDomId = 'processes-search-filters';

  private _processService = inject(ProcessService);
  private _organizationService = inject(OrganizationService);
  private _router = inject(Router);
  private _activatedRoute = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);

  /** Toast DaisyUI (`toast-end toast-bottom`): mensaje tras copiar radicado (como cliente, sin librería npm). */
  public copyRadicadoToast = signal<{ message: string; kind: 'success' | 'error' } | null>(null);
  private _copiedRadicadoToastTimer: ReturnType<typeof setTimeout> | undefined;

  // State
  public processes = signal<Process[]>([]);
  public loading = signal<boolean>(false);
  public pagination = signal<ProcessResponseMeta | null>(null);
  public dashboardStats = signal<ProcessDashboardStats | null>(null);
  public dashboardStatsLoading = signal<boolean>(false);
  public showFilters = signal<boolean>(false);
  /** IDs de procesos con fila expandida (múltiples instancias) */
  public expandedProcessIds = signal<Set<string>>(new Set());
  /** ID de fila bajo hover (para resaltar) */
  public hoveredRowId = signal<string | null>(null);

  /** Menú del FAB móvil (+): muestra acciones (p. ej. Importar Excel) */
  public mobileFabMenuOpen = signal<boolean>(false);

  /** Bottom sheet: lista completa de organizaciones / demandantes / demandados (tap en +N en tarjetas móvil) */
  public partyListSheetOpen = signal(false);
  public partyListSheetTitleKey = signal<string>('processes.partyList.titleOrganizations');
  public partyListSheetItems = signal<string[]>([]);
  /** Radicado asociado al listado (referencia visual en el bottom sheet). */
  public partyListSheetProcessNumber = signal<string>('');

  // Import modal state
  public isImportModalOpen = signal<boolean>(false);
  public importSubmitting = signal<boolean>(false);
  public importResult = signal<ProcessImportBatchResponse | null>(null);
  public importFile = signal<File | null>(null);
  /** Selected organization for import (required) */
  public importOrganizationId = signal<string>('');
  /** Diálogo de confirmación antes de enviar archivo al API */
  public importConfirmOpen = signal<boolean>(false);
  /** Organizations list for import select */
  public importOrganizations = signal<Organization[]>([]);
  public importOrganizationsLoading = signal<boolean>(false);

  /** Importación como procesos privados + fuente de datos */
  public importIsPrivate = signal<boolean>(false);
  public importDataSourceSlug = signal<string>('');
  public importDataSources = signal<ProcessDataSource[]>([]);
  public importDataSourcesLoading = signal<boolean>(false);

  /** Opciones para el combobox de importación (id + nombre) */
  public importOrganizationOptions = computed(() =>
    this.importOrganizations().map((o) => ({ id: o.id, label: o.name }))
  );

  /** Fuentes activas para el select (el `id` es el slug enviado al API) */
  public importDataSourceOptions = computed(() =>
    this.importDataSources()
      .filter((s) => s.is_active)
      .map((s) => ({ id: s.slug, label: s.name }))
  );

  /** Habilita el paso siguiente (confirmación / envío visual del botón principal) */
  public importReadyToConfirm = computed(() => {
    if (this.importSubmitting()) return false;
    if (!this.importFile()) return false;
    if (!this.importOrganizationId()?.trim()) return false;
    if (!this.importIsPrivate()) return true;
    if (this.importDataSourcesLoading()) return false;
    return !!this.importDataSourceSlug()?.trim();
  });

  // Filter form
  public filterForm: FormGroup = this._fb.group({
    process_number: [''],
    court: [''],
    process_class: [''],
    plaintiff: [''],
    defendant: [''],
    organization: [''],
    status: [''],
    /** '' | 'private' | 'public' — query `privacy` */
    privacy: [''],
    has_multiple_instances: [null as boolean | null],
    process_date_range: [null as DateRange | null],
    created_at_range: [null as DateRange | null],
    last_api_update_range: [null as DateRange | null],
  });

  // Table columns
  public columns: DataTableColumn[] = [
    {
      key: 'index',
      label: 'processes.table.index',
      width: '60px',
      align: 'center',
    },
    {
      key: 'process_number',
      label: 'processes.table.processNumber',
      width: '324px',
      align: 'left',
      sortable: true,
    },
    {
      key: 'court',
      label: 'processes.table.court',
      sortable: true,
    },
    {
      key: 'process_class',
      label: 'processes.table.processClass',
      width: '200px',
    },
    {
      key: 'status_label',
      label: 'processes.table.status',
      width: '120px',
      align: 'center',
    },
    {
      key: 'is_private',
      label: 'processes.table.dataOrigin',
      width: '118px',
      align: 'center',
    },
    {
      key: 'plaintiff',
      label: 'processes.table.plaintiff',
      width: '200px',
    },
    {
      key: 'defendant',
      label: 'processes.table.defendant',
      width: '200px',
    },
    {
      key: 'other_subjects',
      label: 'processes.table.otherSubjects',
      width: '200px',
    },
    {
      key: 'organization',
      label: 'processes.table.organization',
      width: '200px',
    },
    {
      key: 'has_multiple_instances',
      label: 'processes.table.multipleInstances',
      width: '150px',
      align: 'center',
      render: (value: boolean) => value ? 'Sí' : 'No',
    },
    {
      key: 'created_at',
      label: 'processes.table.createdAt',
      width: '120px',
      align: 'center',
    },
    {
      key: 'last_activity_date',
      label: 'processes.table.lastActivityDate',
      width: '120px',
      align: 'center',
    },
  ];

  constructor() {
    this._loadFiltersFromQueryParams();
    this.loadDashboardStats();
    this.loadProcesses();
  }

  /**
   * Load KPI dashboard stats for top cards
   */
  loadDashboardStats(): void {
    this.dashboardStatsLoading.set(true);
    this._processService.getDashboardStats().subscribe({
      next: (stats) => {
        this.dashboardStats.set(stats);
        this.dashboardStatsLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading dashboard stats:', error);
        this.dashboardStats.set(null);
        this.dashboardStatsLoading.set(false);
      },
    });
  }

  /**
   * Percentage helper with zero-safe divisor
   */
  getPercentage(value: number, total: number): number {
    if (!total || total <= 0) return 0;
    return Math.round((value / total) * 100);
  }

  /**
   * Outdated ratio over total processes
   */
  getOutdatedRatio(stats: ProcessDashboardStats | null): number {
    if (!stats || !stats.total_processes) return 0;
    return stats.outdated_processes / stats.total_processes;
  }

  /**
   * Tone class for sync health card based on outdated ratio
   */
  getSyncHealthTone(stats: ProcessDashboardStats | null): 'healthy' | 'warning' | 'critical' {
    const ratio = this.getOutdatedRatio(stats);
    if (ratio >= 0.7) return 'critical';
    if (ratio >= 0.35) return 'warning';
    return 'healthy';
  }

  /**
   * Load filters from query params
   */
  private _loadFiltersFromQueryParams(): void {
    const queryParams = this._activatedRoute.snapshot.queryParams;

    // Helper to check if a value is valid (not null, not "null" string, not empty)
    const isValidValue = (value: any): boolean => {
      return value !== null && value !== undefined && value !== '' && value !== 'null';
    };

    // Apply query params to form - only if they have valid values
    if (isValidValue(queryParams['process_number'])) {
      this.filterForm.patchValue({ process_number: queryParams['process_number'] });
    }
    if (isValidValue(queryParams['court'])) {
      this.filterForm.patchValue({ court: queryParams['court'] });
    }
    if (isValidValue(queryParams['process_class'])) {
      this.filterForm.patchValue({ process_class: queryParams['process_class'] });
    }
    if (isValidValue(queryParams['plaintiff'])) {
      this.filterForm.patchValue({ plaintiff: queryParams['plaintiff'] });
    }
    if (isValidValue(queryParams['defendant'])) {
      this.filterForm.patchValue({ defendant: queryParams['defendant'] });
    }
    if (isValidValue(queryParams['organization'])) {
      this.filterForm.patchValue({ organization: queryParams['organization'] });
    }
    if (isValidValue(queryParams['status'])) {
      this.filterForm.patchValue({ status: queryParams['status'] });
    }
    if (queryParams['privacy'] === 'private' || queryParams['privacy'] === 'public') {
      this.filterForm.patchValue({ privacy: queryParams['privacy'] });
    }
    if (isValidValue(queryParams['has_multiple_instances'])) {
      this.filterForm.patchValue({ has_multiple_instances: queryParams['has_multiple_instances'] === 'true' });
    }
    // Load date ranges from query params - only if they have valid values
    if (isValidValue(queryParams['process_date_from']) || isValidValue(queryParams['process_date_to'])) {
      const dateRange: DateRange = {
        from: isValidValue(queryParams['process_date_from']) ? queryParams['process_date_from'] : null,
        to: isValidValue(queryParams['process_date_to']) ? queryParams['process_date_to'] : null,
      };
      this.filterForm.patchValue({ process_date_range: dateRange });
    }
    if (isValidValue(queryParams['created_at_from']) || isValidValue(queryParams['created_at_to'])) {
      const dateRange: DateRange = {
        from: isValidValue(queryParams['created_at_from']) ? queryParams['created_at_from'] : null,
        to: isValidValue(queryParams['created_at_to']) ? queryParams['created_at_to'] : null,
      };
      this.filterForm.patchValue({ created_at_range: dateRange });
    }
    if (isValidValue(queryParams['last_api_update_from']) || isValidValue(queryParams['last_api_update_to'])) {
      const dateRange: DateRange = {
        from: isValidValue(queryParams['last_api_update_from']) ? queryParams['last_api_update_from'] : null,
        to: isValidValue(queryParams['last_api_update_to']) ? queryParams['last_api_update_to'] : null,
      };
      this.filterForm.patchValue({ last_api_update_range: dateRange });
    }
  }

  /**
   * Update query params with current filters
   */
  private _updateQueryParams(filters: ProcessFilter, includePage: boolean = false, page: number = 1): void {
    const queryParams: Record<string, string> = {};

    // Only add params if they have actual values (not null, not empty, not undefined)
    if (filters.process_number && filters.process_number.trim()) {
      queryParams['process_number'] = filters.process_number;
    }
    if (filters.court && filters.court.trim()) {
      queryParams['court'] = filters.court;
    }
    if (filters.process_class && filters.process_class.trim()) {
      queryParams['process_class'] = filters.process_class;
    }
    if (filters.plaintiff && filters.plaintiff.trim()) {
      queryParams['plaintiff'] = filters.plaintiff;
    }
    if (filters.defendant && filters.defendant.trim()) {
      queryParams['defendant'] = filters.defendant;
    }
    if (filters.organization && filters.organization.trim()) {
      queryParams['organization'] = filters.organization;
    }
    if (filters.status && filters.status.trim()) {
      queryParams['status'] = filters.status;
    }
    if (filters.privacy === 'private' || filters.privacy === 'public') {
      queryParams['privacy'] = filters.privacy;
    }
    if (filters.has_multiple_instances !== undefined && filters.has_multiple_instances !== null) {
      queryParams['has_multiple_instances'] = filters.has_multiple_instances.toString();
    }
    if (filters.process_date_from && filters.process_date_from.trim()) {
      queryParams['process_date_from'] = filters.process_date_from;
    }
    if (filters.process_date_to && filters.process_date_to.trim()) {
      queryParams['process_date_to'] = filters.process_date_to;
    }
    if (filters.created_at_from && filters.created_at_from.trim()) {
      queryParams['created_at_from'] = filters.created_at_from;
    }
    if (filters.created_at_to && filters.created_at_to.trim()) {
      queryParams['created_at_to'] = filters.created_at_to;
    }
    if (filters.last_api_update_from && filters.last_api_update_from.trim()) {
      queryParams['last_api_update_from'] = filters.last_api_update_from;
    }
    if (filters.last_api_update_to && filters.last_api_update_to.trim()) {
      queryParams['last_api_update_to'] = filters.last_api_update_to;
    }

    if (includePage && page > 1) {
      queryParams['page'] = page.toString();
    }

    // Build final params - only include params with actual values
    const finalParams: Record<string, string> = { ...queryParams };
    
    // Add page if needed
    if (includePage && page > 1) {
      finalParams['page'] = page.toString();
    }

    // Navigate - Angular Router will replace all query params with only those in finalParams
    this._router.navigate([], {
      relativeTo: this._activatedRoute,
      queryParams: finalParams,
      replaceUrl: true,
    });
  }

  /**
   * Load processes with current filters
   */
  loadProcesses(page: number = 1, perPage: number = 10, scrollMainToTopOnMobile = false): void {
    this.loading.set(true);

    const formValue = this.filterForm.value;
    const processDateRange: DateRange | null = formValue.process_date_range;
    const createdAtRange: DateRange | null = formValue.created_at_range;
    const lastApiUpdateRange: DateRange | null = formValue.last_api_update_range;

    const filters: ProcessFilter = {
      process_number: formValue.process_number?.trim() || undefined,
      court: formValue.court?.trim() || undefined,
      process_class: formValue.process_class?.trim() || undefined,
      plaintiff: formValue.plaintiff?.trim() || undefined,
      defendant: formValue.defendant?.trim() || undefined,
      organization: formValue.organization?.trim() || undefined,
      status: formValue.status?.trim() || undefined,
      privacy:
        formValue.privacy === 'private' || formValue.privacy === 'public'
          ? (formValue.privacy as 'private' | 'public')
          : undefined,
      has_multiple_instances: formValue.has_multiple_instances !== null && formValue.has_multiple_instances !== '' ? formValue.has_multiple_instances : undefined,
      process_date_from: processDateRange?.from && processDateRange.from.trim() ? processDateRange.from : undefined,
      process_date_to: processDateRange?.to && processDateRange.to.trim() ? processDateRange.to : undefined,
      created_at_from: createdAtRange?.from && createdAtRange.from.trim() ? createdAtRange.from : undefined,
      created_at_to: createdAtRange?.to && createdAtRange.to.trim() ? createdAtRange.to : undefined,
      last_api_update_from: lastApiUpdateRange?.from && lastApiUpdateRange.from.trim() ? lastApiUpdateRange.from : undefined,
      last_api_update_to: lastApiUpdateRange?.to && lastApiUpdateRange.to.trim() ? lastApiUpdateRange.to : undefined,
      page,
      per_page: perPage,
    };

    // Remove empty values
    Object.keys(filters).forEach((key) => {
      const value = filters[key as keyof ProcessFilter];
      if (value === '' || value === null || value === undefined) {
        delete filters[key as keyof ProcessFilter];
      }
    });

    this._updateQueryParams(filters, false);

    this._processService.getProcesses(filters).subscribe({
      next: (response) => {
        this.processes.set(response.data);
        this.pagination.set({
          current_page: response.current_page,
          per_page: response.per_page,
          total: response.total,
          last_page: response.last_page,
          from: response.from,
          to: response.to,
        });
        this.loading.set(false);
        if (scrollMainToTopOnMobile) {
          afterNextRender(
            () => this._scrollMainToTopMobileSmooth(),
            { injector: this._injector },
          );
        }
      },
      error: (error) => {
        console.error('Error loading processes:', error);
        this.loading.set(false);
      },
    });
  }

  /**
   * Layout autenticado: el scroll va en `<main class="overflow-y-auto">`, no en `window`.
   * Solo en viewport móvil (max-width: 1023px), alineado con tarjetas y FAB.
   */
  private _scrollMainToTopMobileSmooth(): void {
    const win = this._document.defaultView;
    if (!win || !win.matchMedia('(max-width: 1023px)').matches) {
      return;
    }
    const main =
      (this._document.querySelector('main.flex-1.overflow-y-auto') as HTMLElement | null) ??
      (this._document.querySelector('main') as HTMLElement | null);
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /**
   * Handle search
   */
  onSearch(): void {
    this.loadProcesses(1, this.pagination()?.per_page || 10);
  }

  toggleFilters(): void {
    const wasOpen = this.showFilters();
    this.showFilters.update((value) => !value);

    // Al abrir el panel (@if muestra el bloque después del ciclo siguiente)
    if (wasOpen) {
      return;
    }

    afterNextRender(
      () => {
        this._document
          .getElementById(this.filtersSectionDomId)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { injector: this._injector },
    );
  }

  /**
   * Handle filter reset
   */
  onResetFilters(): void {
    this.filterForm.reset({
      process_number: '',
      court: '',
      process_class: '',
      plaintiff: '',
      defendant: '',
      organization: '',
      status: '',
      privacy: '',
      has_multiple_instances: null,
      process_date_range: null,
      created_at_range: null,
      last_api_update_range: null,
    });

    // Navigate with empty query params
    this._router.navigate([], {
      relativeTo: this._activatedRoute,
      queryParams: {},
      replaceUrl: true,
    });
    this.loadProcesses(1, this.pagination()?.per_page || 10);
  }

  /** Opciones de tamaño de página para la paginación */
  pageSizeOptions = [10, 20, 25, 50, 100];

  /**
   * Handle page change
   */
  onPageChange(event: { page: number; perPage: number }): void {
    this.loadProcesses(event.page, event.perPage);
  }

  onPageChangeFromTable(page: number, perPage: number): void {
    this.loadProcesses(page, perPage, true);
  }

  /**
   * Expandir/colapsar fila de proceso (solo cuando tiene múltiples instancias)
   */
  toggleExpand(process: Process): void {
    if (!process.has_multiple_instances || !process.instances?.length) return;
    const next = new Set(this.expandedProcessIds());
    if (next.has(process.id)) {
      next.delete(process.id);
    } else {
      next.add(process.id);
    }
    this.expandedProcessIds.set(next);
  }

  /**
   * Indica si la fila del proceso está expandida
   */
  isExpanded(process: Process): boolean {
    return this.expandedProcessIds().has(process.id);
  }

  /**
   * Cantidad de instancias asociadas al radicado (vista móvil / pie de tarjeta).
   */
  getInstanceCount(process: Process): number {
    if (process.instances && process.instances.length > 0) return process.instances.length;
    return 1;
  }

  /**
   * Helper para mostrar demandante/demandado/organización: texto principal, (+N) y tooltip con lista completa
   */
  getPartyDisplay(
    list: string[] | null | undefined
  ): { mainText: string; extraCount: number; tooltipText: string; fullList: string[] } {
    const raw = list?.filter(Boolean) ?? [];
    const arr = raw.map((s) => String(s).replace(/\r\n|\r|\t/g, ' ').trim()).filter(Boolean);
    if (arr.length === 0) return { mainText: '', extraCount: 0, tooltipText: '', fullList: [] };
    const mainText = arr[0];
    const extraCount = arr.length - 1;
    const tooltipText = arr.map((name, i) => `${i + 1}. ${name}`).join('\n');
    return { mainText, extraCount, tooltipText, fullList: arr };
  }

  /** Lista de otros sujetos procesales (prioriza array `others` del API) */
  getOthersList(row: { others?: string[]; other_subject?: string | null }): string[] {
    if (row.others?.length) {
      return row.others;
    }
    const single = row.other_subject?.trim();
    return single ? [single.replace(/\s*\(\+\d+\)\s*$/i, '').trim()].filter(Boolean) : [];
  }

  /**
   * Formatear fecha para tabla (si viene en formato ISO; si no, mostrar tal cual)
   */
  formatProcessDate(dateString: string | null | undefined): string {
    if (!dateString) return '–';
    const s = String(dateString).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    return s;
  }

  /** Portapapeles: solo dígitos (sin guiones). Cierra mensaje anterior si se vuelve a copiar rápido. */
  copyProcessRadicado(raw: string | null | undefined, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const clean = (raw ?? '').replace(/\D/g, '');
    if (!clean) return;

    if (this._copiedRadicadoToastTimer) {
      clearTimeout(this._copiedRadicadoToastTimer);
      this._copiedRadicadoToastTimer = undefined;
    }

    const dismiss = (): void => {
      this.copyRadicadoToast.set(null);
      this._copiedRadicadoToastTimer = undefined;
    };

    navigator.clipboard.writeText(clean).then(() => {
      this.copyRadicadoToast.set({
        message: this._transloco.translate('processes.copy.toastSuccess'),
        kind: 'success',
      });
      this._copiedRadicadoToastTimer = setTimeout(() => dismiss(), 2200);
    }).catch(() => {
      this.copyRadicadoToast.set({
        message: this._transloco.translate('processes.copy.toastError'),
        kind: 'error',
      });
      this._copiedRadicadoToastTimer = setTimeout(() => dismiss(), 2200);
    });
  }

  /** Números de página a mostrar en la paginación */
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
      else start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  getShowingRange(): { from: number; to: number } {
    const pagination = this.pagination();
    if (!pagination) return { from: 0, to: 0 };
    const from = pagination.from ?? (pagination.current_page - 1) * pagination.per_page + 1;
    const to = pagination.to ?? Math.min(pagination.current_page * pagination.per_page, pagination.total);
    return { from, to };
  }

  /**
   * Handle row click (simple click on row - expand already handled by toggleExpand)
   */
  onRowClick(process: Process | ProcessInstance): void {
    if ('instances' in process && process.instances?.length) {
      this.toggleExpand(process as Process);
    }
  }

  /**
   * Doble click en fila: navegar al detalle del proceso/instancia.
   * (mismo UX que en `judicial-filings-frontend`)
   */
  onRowDblClick(row: Process | ProcessInstance, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this._router.navigate(['/admin', 'processes', row.id]);
  }

  toggleMobileFabMenu(): void {
    this.mobileFabMenuOpen.update((open) => !open);
  }

  closeMobileFabMenu(): void {
    this.mobileFabMenuOpen.set(false);
  }

  /**
   * Abre el bottom sheet con todas las filas (misma fuente que tooltips de escritorio).
   */
  openPartyListSheet(
    kind: 'organization' | 'plaintiff' | 'defendant' | 'other',
    items: string[],
    processNumber: string,
    event?: Event,
  ): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const filtered = (items ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (filtered.length === 0) {
      return;
    }
    const keys: Record<'organization' | 'plaintiff' | 'defendant' | 'other', string> = {
      organization: 'processes.partyList.titleOrganizations',
      plaintiff: 'processes.partyList.titlePlaintiffs',
      defendant: 'processes.partyList.titleDefendants',
      other: 'processes.partyList.titleOthers',
    };
    this.partyListSheetTitleKey.set(keys[kind]);
    this.partyListSheetItems.set(filtered);
    this.partyListSheetProcessNumber.set((processNumber ?? '').trim());
    this.partyListSheetOpen.set(true);
  }

  closePartyListSheet(): void {
    this.partyListSheetOpen.set(false);
    this.partyListSheetProcessNumber.set('');
  }

  /**
   * Desde el FAB móvil: cierra el menú del + y abre el bottom sheet de importación.
   */
  openImportFromMobileFab(): void {
    this.closeMobileFabMenu();
    this.openImportModal();
  }

  /**
   * Open import Excel modal and load organizations for the select
   */
  openImportModal(): void {
    this.importFile.set(null);
    this.importResult.set(null);
    this.importOrganizationId.set('');
    this.importIsPrivate.set(false);
    this.importDataSourceSlug.set('');
    this.importDataSources.set([]);
    this.isImportModalOpen.set(true);
    this._loadImportOrganizations();
  }

  /**
   * Load organizations for the import modal select (all, no pagination limit for dropdown)
   */
  private _loadImportOrganizations(): void {
    this.importOrganizationsLoading.set(true);
    this._organizationService.getOrganizations({ per_page: 500 }).subscribe({
      next: (response) => {
        this.importOrganizations.set(response.data);
        this.importOrganizationsLoading.set(false);
      },
      error: () => {
        this.importOrganizationsLoading.set(false);
      },
    });
  }

  /**
   * Close import Excel modal (y el menú del FAB móvil, si estuviera abierto)
   */
  closeImportModal(): void {
    this.isImportModalOpen.set(false);
    this.closeMobileFabMenu();
    this.importConfirmOpen.set(false);
    this.importFile.set(null);
    this.importResult.set(null);
    this.importOrganizationId.set('');
    this.importIsPrivate.set(false);
    this.importDataSourceSlug.set('');
    this.importDataSources.set([]);
    this.importSubmitting.set(false);
  }

  /**
   * Handle file selected from drop zone
   */
  onImportFileSelected(file: File | null): void {
    this.importFile.set(file);
  }

  onImportPrivateChange(checked: boolean): void {
    this.importIsPrivate.set(checked);
    this.importDataSourceSlug.set('');
    if (!checked) {
      return;
    }
    this._loadImportDataSources();
  }

  /** Éxito: import estándar (batch_id) o privado con contadores numéricos */
  isImportResultSuccess(res: ProcessImportBatchResponse): boolean {
    const bid = res.batch_id?.trim();
    if (bid) {
      return true;
    }
    return typeof res.processes_created === 'number';
  }

  getImportConfirmTitle(): string {
    return this._transloco.translate('processes.import.confirmTitle');
  }

  getImportConfirmLead(): string {
    if (!this.importConfirmOpen()) {
      return '';
    }
    const key = this.importIsPrivate()
      ? 'processes.import.confirmMessagePrivate'
      : 'processes.import.confirmMessage';
    return this._transloco.translate(key);
  }

  getImportConfirmFootnote(): string {
    if (!this.importConfirmOpen()) {
      return '';
    }
    const key = this.importIsPrivate()
      ? 'processes.import.confirmFootnotePrivate'
      : 'processes.import.confirmFootnote';
    return this._transloco.translate(key);
  }

  getImportConfirmDetailRows(): ConfirmationDialogDetailRow[] {
    if (!this.importConfirmOpen()) {
      return [];
    }
    const file = this.importFile();
    const organizationId = this.importOrganizationId()?.trim();
    if (!file || !organizationId) {
      return [];
    }
    const organizationName = this._importOrganizationDisplayName(organizationId);
    const rows: ConfirmationDialogDetailRow[] = [
      { label: this._transloco.translate('processes.import.confirmFileLabel'), value: file.name },
      {
        label: this._transloco.translate('processes.import.confirmOrganizationLabel'),
        value: organizationName,
      },
    ];
    if (this.importIsPrivate()) {
      const slug = this.importDataSourceSlug()?.trim();
      if (slug) {
        rows.push({
          label: this._transloco.translate('processes.import.confirmDataSourceLabel'),
          value: this._importDataSourceDisplayName(slug),
        });
      }
    }
    return rows;
  }

  /**
   * Abre el paso de confirmación (nombre de archivo + organización).
   */
  openImportConfirmDialog(): void {
    const file = this.importFile();
    const organizationId = this.importOrganizationId()?.trim();
    if (!file || !organizationId) return;
    if (this.importIsPrivate() && !this.importDataSourceSlug()?.trim()) {
      return;
    }

    this.importConfirmOpen.set(true);
  }

  onCancelImportConfirm(): void {
    this.importConfirmOpen.set(false);
  }

  /**
   * Tras confirmar: sube archivo + organization_id (importación en segundo plano + reporte por email).
   */
  onConfirmImportSubmit(): void {
    this.importConfirmOpen.set(false);
    this.executeImportSubmit();
  }

  private _importOrganizationDisplayName(organizationId: string): string {
    const org = this.importOrganizations().find((o) => o.id === organizationId);
    const name = org?.name?.trim();
    return name || organizationId;
  }

  private _importDataSourceDisplayName(slug: string): string {
    const src = this.importDataSources().find((s) => s.slug === slug);
    const name = src?.name?.trim();
    return name || slug;
  }

  private _loadImportDataSources(): void {
    this.importDataSourcesLoading.set(true);
    this._processService.getProcessDataSources().subscribe({
      next: (list) => {
        this.importDataSources.set(Array.isArray(list) ? list : []);
        this.importDataSourcesLoading.set(false);
      },
      error: () => {
        this.importDataSources.set([]);
        this.importDataSourcesLoading.set(false);
      },
    });
  }

  private executeImportSubmit(): void {
    const file = this.importFile();
    const organizationId = this.importOrganizationId()?.trim();
    if (!file || !organizationId) return;

    const isPrivate = this.importIsPrivate();
    const dataSourceSlug = this.importDataSourceSlug()?.trim();
    if (isPrivate && !dataSourceSlug) {
      return;
    }

    this.importSubmitting.set(true);
    this.importResult.set(null);

    const req = isPrivate
      ? this._processService.importPrivateProcesses(file, organizationId, dataSourceSlug!)
      : this._processService.importProcesses(file, organizationId);

    req.subscribe({
      next: (response) => {
        this.importResult.set(response);
        this.importSubmitting.set(false);
      },
      error: (err) => {
        const message = err.error?.message || this._transloco.translate('processes.import.errors.generic');
        this.importResult.set({ message });
        this.importSubmitting.set(false);
      },
    });
  }
}
