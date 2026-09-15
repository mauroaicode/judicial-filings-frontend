import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  effect,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  ManualRegistrationListMeta,
  ManualRegistrationReason,
  ManualRegistrationRequest,
  ManualRegistrationStatus,
  ManualRegistrationSubject,
} from '@app/core/models/process/manual-registration-request.model';
import { ManualRegistrationService } from '@app/core/services/process/manual-registration.service';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { BottomSheetModalComponent } from '@app/shared/components/bottom-sheet-modal/bottom-sheet-modal.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import { ProcessImportModalsComponent } from '@app/modules/admin/processes/components/process-import-modals/process-import-modals.component';

@Component({
  selector: 'app-manual-registrations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    ProcessNumberPipe,
    ConfirmationDialogComponent,
    BottomSheetModalComponent,
    ProcessImportModalsComponent,
  ],
  templateUrl: './manual-registrations.component.html',
  styleUrl: './manual-registrations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualRegistrationsComponent implements OnInit {
  readonly filtersSectionDomId = 'manual-registrations-search-filters';
  private static readonly _REQUEST_ROW_HIGHLIGHT_MS = 16_000;

  private _service = inject(ManualRegistrationService);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);
  private _activatedRoute = inject(ActivatedRoute);
  private _destroyRef = inject(DestroyRef);

  public importModals = viewChild(ProcessImportModalsComponent);

  public showFilters = signal<boolean>(false);
  public loading = signal<boolean>(false);
  public items = signal<ManualRegistrationRequest[]>([]);
  public pagination = signal<ManualRegistrationListMeta | null>(null);
  public currentPerPage = signal<number>(20);
  public hoveredRowId = signal<string | null>(null);
  public highlightedRequestId = signal<string | null>(null);
  public selectedRequest = signal<ManualRegistrationRequest | null>(null);
  public copiedMessage = signal<string | null>(null);
  public toastMessage = signal<string | null>(null);
  public toastKind = signal<'success' | 'error'>('success');
  public resolving = signal<boolean>(false);

  public confirmOpen = signal<boolean>(false);
  public pendingResolve = signal<{
    item: ManualRegistrationRequest;
    status: 'registered' | 'rejected';
  } | null>(null);

  public readonly pageSizeOptions = [10, 20, 25, 50, 100] as const;

  public readonly filterForm = new FormGroup({
    status: new FormControl<ManualRegistrationStatus>('pending', { nonNullable: true }),
    reason: new FormControl<ManualRegistrationReason | ''>('', { nonNullable: true }),
    organization: new FormControl('', { nonNullable: true }),
    process_number: new FormControl('', { nonNullable: true }),
  });

  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private _highlightTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _autoOpenedRequestId: string | null = null;

  constructor() {
    this._applyQueryFilters();
    this._service.refreshPendingCount();
    this.loadRequests();

    let seenRevision = this._service.queueRevision();
    effect(() => {
      const rev = this._service.queueRevision();
      if (rev === seenRevision) {
        return;
      }
      seenRevision = rev;
      this.loadRequests(1);
    });
  }

  ngOnInit(): void {
    const sub = this._activatedRoute.queryParamMap.subscribe(() => {
      this._reconcileRequestQueryParam();
    });
    this._destroyRef.onDestroy(() => {
      sub.unsubscribe();
      if (this._highlightTimeoutId != null) {
        clearTimeout(this._highlightTimeoutId);
        this._highlightTimeoutId = null;
      }
    });
  }

  loadRequests(page: number = 1): void {
    const raw = this.filterForm.getRawValue();
    const perPageNum = Number(this.currentPerPage());
    const per_page = Number.isFinite(perPageNum) && perPageNum > 0 ? perPageNum : 20;

    this.loading.set(true);
    this._service
      .list({
        page,
        per_page,
        status: raw.status,
        reason: raw.reason || undefined,
        organization: raw.organization.trim() || undefined,
        process_number: raw.process_number.trim() || undefined,
      })
      .subscribe({
        next: (response) => {
          const data = response.data || [];
          if (data.length === 0 && (response.current_page ?? 1) > 1) {
            this.loadRequests(response.current_page - 1);
            return;
          }
          this.items.set(data);
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
          const selectedId = this.selectedRequest()?.id;
          if (selectedId) {
            const updated = (response.data || []).find((row) => row.id === selectedId);
            this.selectedRequest.set(updated ?? null);
          }
          this._reconcileRequestQueryParam();
        },
        error: (error) => {
          console.error('Error cargando altas manuales:', error);
          this.loading.set(false);
          this._showToast(this._transloco.translate('manualRegistrations.loadError'), 'error');
        },
      });
  }

  applyFilters(): void {
    this.loadRequests(1);
  }

  toggleFilters(): void {
    const wasOpen = this.showFilters();
    this.showFilters.update((value) => !value);
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

  resetFilters(): void {
    this.filterForm.reset({
      status: 'pending',
      reason: '',
      organization: '',
      process_number: '',
    });
    this.loadRequests(1);
  }

  onPageChangeFromTable(page: number, perPage: number): void {
    this.currentPerPage.set(perPage);
    this.loadRequests(page);
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

  getStatusClass(status: ManualRegistrationStatus): string {
    if (status === 'pending') return 'badge-warning';
    if (status === 'registered') return 'badge-success';
    if (status === 'rejected') return 'badge-error';
    return 'badge-neutral';
  }

  lawyerRoleLabel(role: ManualRegistrationRequest['lawyer_role']): string {
    if (role === 'plaintiff') {
      return this._transloco.translate('manualRegistrations.lawyerRole.plaintiff');
    }
    if (role === 'defendant') {
      return this._transloco.translate('manualRegistrations.lawyerRole.defendant');
    }
    return '–';
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '–';
    const s = String(value).trim();
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        this.copiedMessage.set(this._transloco.translate('manualRegistrations.copied'));
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = setTimeout(() => this.copiedMessage.set(null), 2000);
      })
      .catch((error) => {
        console.error('No se pudo copiar:', error);
      });
  }

  goToPrivateImport(item: ManualRegistrationRequest, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.importModals()?.openExcel({
      isPrivate: true,
      organizationId: item.organization_id,
      processNumber: item.process_number,
    });
  }

  goToActuacionesImport(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.importModals()?.openActuaciones();
  }

  openDetail(item: ManualRegistrationRequest, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedRequest.set(item);
  }

  closeDetail(): void {
    this.selectedRequest.set(null);
  }

  subjectsOf(list: ManualRegistrationSubject[] | null | undefined): ManualRegistrationSubject[] {
    if (!Array.isArray(list)) return [];
    return list.filter((s) => (s?.name || '').trim().length > 0);
  }

  subjectLine(subject: ManualRegistrationSubject): string {
    const name = (subject.name || '').trim() || '–';
    const id = (subject.identification || '').trim();
    return id ? `${name} · ${id}` : name;
  }

  partyPreview(list: ManualRegistrationSubject[] | null | undefined): { main: string; extra: number } {
    const people = this.subjectsOf(list);
    if (people.length === 0) return { main: '–', extra: 0 };
    return { main: this.subjectLine(people[0]), extra: Math.max(0, people.length - 1) };
  }

  copySubject(subject: ManualRegistrationSubject, event?: Event): void {
    this.copyToClipboard(this.subjectLine(subject), event);
  }

  copyPartyGroup(list: ManualRegistrationSubject[] | null | undefined, event?: Event): void {
    const text = this.subjectsOf(list)
      .map((s) => this.subjectLine(s))
      .join('\n');
    this.copyToClipboard(text, event);
  }

  openResolveConfirm(item: ManualRegistrationRequest, status: 'registered' | 'rejected', event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.pendingResolve.set({ item, status });
    this.confirmOpen.set(true);
  }

  onCancelResolve(): void {
    this.confirmOpen.set(false);
    this.pendingResolve.set(null);
  }

  getConfirmTitle(): string {
    const pending = this.pendingResolve();
    if (!pending) return '';
    return this._transloco.translate(
      pending.status === 'registered'
        ? 'manualRegistrations.confirm.registeredTitle'
        : 'manualRegistrations.confirm.rejectedTitle'
    );
  }

  getConfirmMessage(): string {
    const pending = this.pendingResolve();
    if (!pending) return '';
    return this._transloco.translate(
      pending.status === 'registered'
        ? 'manualRegistrations.confirm.registeredMessage'
        : 'manualRegistrations.confirm.rejectedMessage'
    );
  }

  getConfirmLabel(): string {
    const pending = this.pendingResolve();
    if (!pending) return '';
    return this._transloco.translate(
      pending.status === 'registered'
        ? 'manualRegistrations.actions.markRegistered'
        : 'manualRegistrations.actions.reject'
    );
  }

  getConfirmClass(): string {
    return this.pendingResolve()?.status === 'rejected' ? 'btn-error' : 'btn-primary';
  }

  getConfirmDetailRows(): ConfirmationDialogDetailRow[] {
    const pending = this.pendingResolve();
    if (!pending) return [];
    return [
      {
        label: this._transloco.translate('manualRegistrations.table.processNumber'),
        value: pending.item.process_number,
      },
      {
        label: this._transloco.translate('manualRegistrations.table.organization'),
        value: pending.item.organization_name || '–',
      },
    ];
  }

  onConfirmResolve(): void {
    const pending = this.pendingResolve();
    if (!pending || this.resolving()) return;

    this.resolving.set(true);
    this.confirmOpen.set(false);
    this.pendingResolve.set(null);

    this._service.resolve(pending.item.id, { status: pending.status }).subscribe({
      next: (response) => {
        this.resolving.set(false);
        const fallback =
          pending.status === 'registered'
            ? this._transloco.translate('manualRegistrations.resolveRegistered')
            : this._transloco.translate('manualRegistrations.resolveRejected');
        this._showToast(response.message?.trim() || fallback, 'success');
        this.closeDetail();
        const page = this.pagination()?.current_page ?? 1;
        this.loadRequests(page);
      },
      error: (err: HttpErrorResponse) => {
        this.resolving.set(false);
        this._showToast(this._resolveErrorMessage(err), 'error');
      },
    });
  }

  private _resolveErrorMessage(err: HttpErrorResponse): string {
    const body = err.error as { message?: string } | undefined;
    if (typeof body?.message === 'string' && body.message.trim()) {
      return body.message;
    }
    return this._transloco.translate('manualRegistrations.resolveError');
  }

  private _showToast(message: string, kind: 'success' | 'error'): void {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.toastMessage.set(message);
    this.toastKind.set(kind);
    this._toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
      this._toastTimer = null;
    }, 3200);
  }

  private _applyQueryFilters(): void {
    const processNumber = this._activatedRoute.snapshot.queryParamMap.get('process_number')?.trim();
    if (processNumber) {
      this.filterForm.patchValue({ process_number: processNumber });
    }
  }

  private _reconcileRequestQueryParam(): void {
    const requestId = this._activatedRoute.snapshot.queryParamMap.get('request')?.trim();
    if (!requestId) {
      return;
    }
    const item = this.items().find((row) => row.id === requestId);
    if (!item) {
      return;
    }
    this._highlightRequestRow(requestId);
    if (this._autoOpenedRequestId !== requestId) {
      this.selectedRequest.set(item);
      this._autoOpenedRequestId = requestId;
    }
  }

  private _highlightRequestRow(requestId: string): void {
    this.highlightedRequestId.set(requestId);
    if (this._highlightTimeoutId != null) {
      clearTimeout(this._highlightTimeoutId);
    }

    afterNextRender(
      () => {
        const el = this._document.querySelector(`[data-request-id="${CSS.escape(requestId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      { injector: this._injector },
    );

    this._highlightTimeoutId = setTimeout(() => {
      this.highlightedRequestId.set(null);
      this._highlightTimeoutId = null;
    }, ManualRegistrationsComponent._REQUEST_ROW_HIGHLIGHT_MS);
  }
}
