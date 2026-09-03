import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  CreateOrganizationPayload,
  Organization,
  OrganizationFilter,
  OrganizationResponseMeta,
  OrganizationStats,
  SelectOption,
  UpdateOrganizationSettingsResponse,
} from '@app/core/models/organization/organization.model';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { ConfirmationDialogComponent } from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { OrganizationSettingsModalComponent } from './components/organization-settings-modal/organization-settings-modal.component';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    DateRangePickerComponent,
    ConfirmationDialogComponent,
    OrganizationSettingsModalComponent,
  ],
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsComponent {
  readonly filtersSectionDomId = 'clients-search-filters';

  private _organizationService = inject(OrganizationService);
  private _router = inject(Router);
  private _activatedRoute = inject(ActivatedRoute);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);

  /** Panel de filtros cerrado por defecto (mismo criterio que procesos / historial) */
  public showFilters = signal<boolean>(false);

  public organizations = signal<Organization[]>([]);
  public loading = signal<boolean>(false);
  public pagination = signal<OrganizationResponseMeta | null>(null);

  /** KPI GET /organizations/stats */
  public statsLoading = signal<boolean>(true);
  public organizationStats = signal<OrganizationStats | null>(null);

  /** Opciones para tipo (persona natural / jurídica) */
  public typeOptions = signal<SelectOption[]>([]);
  /** Opciones para estado (activo / inactivo) */
  public statusOptions = signal<SelectOption[]>([]);

  /** Modal crear organización: abierto */
  public createModalOpen = signal<boolean>(false);
  /** Paso del modal: 0 = elegir tipo, 1 = formulario */
  public createStep = signal<number>(0);
  /** Envío del formulario de creación */
  public createSubmitting = signal<boolean>(false);
  /** Modal de confirmación antes de crear */
  public confirmCreateOpen = signal<boolean>(false);
  /** Toast de éxito tras crear */
  public successToastMessage = signal<string | null>(null);
  /** Mensajes de error de validación (422) al crear */
  public createValidationErrors = signal<string[]>([]);
  /** Organización recién creada (para mostrar credenciales si se generó contraseña) */
  public createdOrganization = signal<Organization | null>(null);
  /** Modal de éxito/credenciales abierto */
  public successCredentialsOpen = signal<boolean>(false);
  /** Organización para toggle de notificaciones */
  public notifyingOrg = signal<Organization | null>(null);
  /** Modal confirmación notificaciones */
  public confirmNotificationOpen = signal<boolean>(false);
  /** Modal configuración rápida de organización */
  public settingsModalOpen = signal<boolean>(false);
  public settingsOrganizationId = signal<string | null>(null);
  private _toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public filterForm: FormGroup = this._fb.group({
    name: [''],
    type: [''],
    is_active: [''],
    email: [''],
    created_at_range: [null as DateRange | null],
  });

  /** Formulario crear organización: tipo + nombre empresa o nombre completo + contact_person (jurídica) + resto */
  public createForm: FormGroup = this._fb.group({
    organizationType: ['', Validators.required],
    name: [''],
    fullName: [''],
    identification: [''],
    address: [''],
    phone: [''],
    email: [''],
    contact_person: [''],
    generate_password: [false],
  });

  pageSizeOptions = [10, 20, 25, 50, 100];

  constructor() {
    this._loadSelectOptions();
    this._loadFiltersFromQueryParams();
    this.loadOrganizations();
    this.loadOrganizationStats();
  }

  loadOrganizationStats(): void {
    this.statsLoading.set(true);
    this._organizationService.getOrganizationStats().subscribe({
      next: (data) => {
        this.organizationStats.set(data);
        this.statsLoading.set(false);
      },
      error: () => {
        this.organizationStats.set(null);
        this.statsLoading.set(false);
      },
    });
  }

  /** Porcentaje activas sobre el total */
  getActiveSharePercent(stats: OrganizationStats): number {
    if (!stats.total || stats.total <= 0) return 0;
    return Math.round((stats.active / stats.total) * 100);
  }

  /** Porcentaje natural / jurídica sobre el total */
  getNaturalSharePercent(stats: OrganizationStats): number {
    if (!stats.total || stats.total <= 0) return 0;
    return Math.round((stats.natural / stats.total) * 100);
  }

  getJuridicalSharePercent(stats: OrganizationStats): number {
    if (!stats.total || stats.total <= 0) return 0;
    return Math.round((stats.juridical / stats.total) * 100);
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

  private _loadSelectOptions(): void {
    this._organizationService.getOrganizationTypes().subscribe({
      next: (res) => this.typeOptions.set(res.data ?? []),
      error: () => this.typeOptions.set([]),
    });
    this._organizationService.getOrganizationStatuses().subscribe({
      next: (res) => this.statusOptions.set(res.data ?? []),
      error: () => this.statusOptions.set([]),
    });
  }

  private _loadFiltersFromQueryParams(): void {
    const queryParams = this._activatedRoute.snapshot.queryParams;
    const isValidValue = (value: unknown): boolean =>
      value !== null && value !== undefined && value !== '' && value !== 'null';

    if (isValidValue(queryParams['name'])) {
      this.filterForm.patchValue({ name: queryParams['name'] });
    }
    if (isValidValue(queryParams['type'])) {
      this.filterForm.patchValue({ type: queryParams['type'] });
    }
    if (isValidValue(queryParams['is_active'])) {
      this.filterForm.patchValue({ is_active: queryParams['is_active'] });
    }
    if (isValidValue(queryParams['email'])) {
      this.filterForm.patchValue({ email: queryParams['email'] });
    }
    if (isValidValue(queryParams['created_at_from']) || isValidValue(queryParams['created_at_to'])) {
      this.filterForm.patchValue({
        created_at_range: {
          from: isValidValue(queryParams['created_at_from']) ? queryParams['created_at_from'] : null,
          to: isValidValue(queryParams['created_at_to']) ? queryParams['created_at_to'] : null,
        },
      });
    }
  }

  private _updateQueryParams(filters: OrganizationFilter, includePage: boolean = false, page: number = 1): void {
    const queryParams: Record<string, string> = {};
    if (filters.name?.trim()) queryParams['name'] = filters.name;
    if (filters.type?.trim()) queryParams['type'] = filters.type;
    if (filters.is_active?.trim()) queryParams['is_active'] = filters.is_active;
    if (filters.email?.trim()) queryParams['email'] = filters.email;
    if (filters.created_at_from?.trim()) queryParams['created_at_from'] = filters.created_at_from;
    if (filters.created_at_to?.trim()) queryParams['created_at_to'] = filters.created_at_to;
    if (includePage && page > 1) queryParams['page'] = page.toString();

    this._router.navigate([], {
      relativeTo: this._activatedRoute,
      queryParams: Object.keys(queryParams).length ? queryParams : {},
      replaceUrl: true,
    });
  }

  loadOrganizations(page: number = 1, perPage: number = 10, scrollMainToTopOnMobile = false): void {
    this.loading.set(true);

    const formValue = this.filterForm.value;
    const createdAtRange: DateRange | null = formValue.created_at_range;

    const filters: OrganizationFilter = {
      name: formValue.name?.trim() || undefined,
      type: formValue.type?.trim() || undefined,
      is_active: formValue.is_active?.trim() || undefined,
      email: formValue.email?.trim() || undefined,
      created_at_from: createdAtRange?.from?.trim() ? createdAtRange.from : undefined,
      created_at_to: createdAtRange?.to?.trim() ? createdAtRange.to : undefined,
      page,
      per_page: perPage,
    };

    Object.keys(filters).forEach((key) => {
      const value = filters[key as keyof OrganizationFilter];
      if (value === '' || value === null || value === undefined) {
        delete filters[key as keyof OrganizationFilter];
      }
    });

    this._updateQueryParams(filters, false);

    this._organizationService.getOrganizations(filters).subscribe({
      next: (response) => {
        this.organizations.set(response.data);
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
          afterNextRender(() => this._scrollMainToTopMobileSmooth(), { injector: this._injector });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(): void {
    this.loadOrganizations(1, this.pagination()?.per_page ?? 10);
  }

  onResetFilters(): void {
    this.filterForm.reset({
      name: '',
      type: '',
      is_active: '',
      email: '',
      created_at_range: null,
    });
    this._router.navigate([], {
      relativeTo: this._activatedRoute,
      queryParams: {},
      replaceUrl: true,
    });
    this.loadOrganizations(1, this.pagination()?.per_page ?? 10);
  }

  onPageChangeFromTable(page: number, perPage: number): void {
    this.loadOrganizations(page, perPage, true);
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '–';
    const s = String(dateString).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime())
        ? s
        : d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    return s;
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

  getTypeLabel(value: string): string {
    return this.typeOptions().find((o) => o.value === value)?.label ?? value;
  }

  formatProcessesCell(org: Organization): string {
    if (org.active_processes_count === undefined && org.max_active_processes === undefined) {
      return '–';
    }
    const count = org.active_processes_count ?? 0;
    if (org.max_active_processes === null || org.max_active_processes === undefined) {
      return `${count} / ∞`;
    }
    return `${count} / ${org.max_active_processes}`;
  }

  openSettingsModal(org: Organization): void {
    this.settingsOrganizationId.set(org.id);
    this.settingsModalOpen.set(true);
  }

  closeSettingsModal(): void {
    this.settingsModalOpen.set(false);
    this.settingsOrganizationId.set(null);
  }

  onSettingsSaved(response: UpdateOrganizationSettingsResponse): void {
    const settings = response.settings;
    const organizationId = settings.organization_id ?? this.settingsOrganizationId();
    this.organizations.update((orgs) =>
      orgs.map((org) =>
        org.id === organizationId
          ? {
              ...org,
              max_active_processes: settings.max_active_processes,
              default_max_active_processes: settings.default_max_active_processes,
              active_processes_count: settings.active_processes_count ?? org.active_processes_count,
            }
          : org
      )
    );
    this.closeSettingsModal();
    this.showSuccessToast(
      response.message || this._transloco.translate('clients.settings.toastSuccess')
    );
  }

  isJuridical(): boolean {
    return this.createForm.get('organizationType')?.value === 'juridical';
  }

  openCreateModal(): void {
    this.createStep.set(0);
    this.createValidationErrors.set([]);
    this.createForm.reset({
      organizationType: '',
      name: '',
      fullName: '',
      identification: '',
      address: '',
      phone: '',
      email: '',
      contact_person: '',
      generate_password: false,
    });
    this.createdOrganization.set(null);
    this.successCredentialsOpen.set(false);
    this.createModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
    this.createStep.set(0);
    this.confirmCreateOpen.set(false);
    this.createSubmitting.set(false);
    this.createValidationErrors.set([]);
  }

  selectCreateType(type: string): void {
    if (type === 'natural' || type === 'juridical') {
      this.createForm.patchValue({ organizationType: type });
      this.createStep.set(1);
    }
  }

  backToCreateType(): void {
    this.createStep.set(0);
  }

  buildCreatePayload(): CreateOrganizationPayload | null {
    const type = this.createForm.get('organizationType')?.value as 'natural' | 'juridical';
    if (!type) return null;

    const v = this.createForm.value;
    if (type === 'natural') {
      const fullName = (v.fullName ?? '').trim();
      if (!fullName) return null;
      return {
        name: fullName,
        type: 'natural',
        contact_person: fullName,
        identification: v.identification?.trim() || undefined,
        address: v.address?.trim() || undefined,
        phone: v.phone?.trim() || undefined,
        email: v.email?.trim() || undefined,
        generate_password: v.generate_password || false,
      };
    }
    const name = (v.name ?? '').trim();
    if (!name) return null;
    return {
      name,
      type: 'juridical',
      contact_person: v.contact_person?.trim() || undefined,
      identification: v.identification?.trim() || undefined,
      address: v.address?.trim() || undefined,
      phone: v.phone?.trim() || undefined,
      email: v.email?.trim() || undefined,
      generate_password: v.generate_password || false,
    };
  }

  onSubmitCreate(): void {
    if (this.buildCreatePayload()) {
      this.confirmCreateOpen.set(true);
    }
  }

  onConfirmCreate(): void {
    const payload = this.buildCreatePayload();
    if (!payload) return;

    this.confirmCreateOpen.set(false);
    this.createSubmitting.set(true);
    this.createValidationErrors.set([]);

    this._organizationService.createOrganization(payload).subscribe({
      next: (org) => {
        this.createSubmitting.set(false);
        this.closeCreateModal();

        if (payload.generate_password && org.password) {
          // Mostrar modal de credenciales
          this.createdOrganization.set(org);
          this.successCredentialsOpen.set(true);
        } else {
          this.showSuccessToast(this._transloco.translate('clients.create.toastSuccess'));
        }

        this.loadOrganizations(1, this.pagination()?.per_page ?? 10);
        this.loadOrganizationStats();
      },
      error: (err) => {
        this.createSubmitting.set(false);
        const messages = this._parseValidationErrors(err);
        this.createValidationErrors.set(messages);
      },
    });
  }

  copyToClipboard(text: string | null | undefined): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      // Opcional: mostrar un pequeño feedback visual
    });
  }

  closeSuccessCredentials(): void {
    this.successCredentialsOpen.set(false);
    this.createdOrganization.set(null);
  }

  onToggleNotifications(org: Organization): void {
    this.notifyingOrg.set(org);
    this.confirmNotificationOpen.set(true);
  }

  onCancelNotificationToggle(): void {
    this.confirmNotificationOpen.set(false);
    this.notifyingOrg.set(null);
    // Recargar para restaurar el switch si fue cancelado
    this.loadOrganizations(this.pagination()?.current_page ?? 1, this.pagination()?.per_page ?? 10);
  }

  onConfirmNotificationToggle(): void {
    const org = this.notifyingOrg();
    if (!org) return;

    this.confirmNotificationOpen.set(false);
    const newStatus = !org.is_receiving_notifications;

    this._organizationService.updateNotificationStatus(org.id, newStatus).subscribe({
      next: () => {
        this.showSuccessToast(this._transloco.translate('clients.notifications.toastSuccess'));
        this.notifyingOrg.set(null);
        this.loadOrganizations(this.pagination()?.current_page ?? 1, this.pagination()?.per_page ?? 10);
      },
      error: () => {
        this.notifyingOrg.set(null);
        this.loadOrganizations(this.pagination()?.current_page ?? 1, this.pagination()?.per_page ?? 10);
      },
    });
  }

  getConfirmNotificationTitle(): string {
    const org = this.notifyingOrg();
    if (!org) return '';
    const key = org.is_receiving_notifications ? 'clients.notifications.confirmDeactivateTitle' : 'clients.notifications.confirmActivateTitle';
    return this._transloco.translate(key);
  }

  getConfirmNotificationMessage(): string {
    const org = this.notifyingOrg();
    if (!org) return '';
    const key = org.is_receiving_notifications ? 'clients.notifications.confirmDeactivateMessage' : 'clients.notifications.confirmActivateMessage';
    return this._transloco.translate(key, { name: org.name });
  }

  /**
   * Extrae mensajes de validación de una respuesta 422 (Laravel u otro backend).
   * Soporta: { messages: string[] } | { errors: { [field]: string[] } } | campos en raíz (ej. phone: ["..."])
   */
  private _parseValidationErrors(err: { status?: number; error?: unknown }): string[] {
    const body = err?.error;
    if (!body || typeof body !== 'object') {
      return [this._transloco.translate('clients.create.errorGeneric')];
    }

    const list: string[] = [];

    if (Array.isArray((body as { messages?: string[] }).messages)) {
      list.push(...(body as { messages: string[] }).messages);
    }

    const errors = (body as { errors?: Record<string, string[]> }).errors;
    if (errors && typeof errors === 'object') {
      for (const key of Object.keys(errors)) {
        const arr = errors[key];
        if (Array.isArray(arr)) {
          list.push(...arr);
        }
      }
    }

    // Campos en la raíz (ej. phone: ["El teléfono debe..."])
    for (const key of Object.keys(body)) {
      if (key === 'message' || key === 'messages' || key === 'errors' || key === 'code') continue;
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        list.push(...(value as string[]));
      }
    }

    const unique = [...new Set(list)];
    return unique.length > 0 ? unique : [this._transloco.translate('clients.create.errorGeneric')];
  }

  onCancelConfirmCreate(): void {
    this.confirmCreateOpen.set(false);
  }

  private showSuccessToast(message: string): void {
    if (this._toastTimeoutId != null) {
      clearTimeout(this._toastTimeoutId);
      this._toastTimeoutId = null;
    }
    this.successToastMessage.set(message);
    this._toastTimeoutId = setTimeout(() => {
      this._toastTimeoutId = null;
      this.successToastMessage.set(null);
    }, 3000);
  }

  getConfirmCreateTitle(): string {
    return this._transloco.translate('clients.create.confirmTitle');
  }

  getConfirmCreateMessage(): string {
    return this._transloco.translate('clients.create.confirmMessage');
  }
}
