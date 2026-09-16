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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  ManualRegistrationLawyerRole,
  ManualRegistrationListMeta,
  ManualRegistrationReason,
  ManualRegistrationRequest,
  ManualRegistrationStatus,
  ManualRegistrationSubject,
  RegisterManualRegistrationPayload,
} from '@app/core/models/process/manual-registration-request.model';
import { ManualRegistrationService } from '@app/core/services/process/manual-registration.service';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { BottomSheetModalComponent } from '@app/shared/components/bottom-sheet-modal/bottom-sheet-modal.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import { ProcessImportModalsComponent } from '@app/modules/admin/processes/components/process-import-modals/process-import-modals.component';
import { ROUTES_ADMIN } from '@app/core/constants/router.constant';

type SubjectFormRow = { name: string; identification: string };
type PartyGroup = 'plaintiffs' | 'defendants' | 'otherSubjects';

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
  private static readonly _OPTIONAL_TEXT_MAX = 255;

  private _service = inject(ManualRegistrationService);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);
  private _activatedRoute = inject(ActivatedRoute);
  private _router = inject(Router);
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
  public toastProcessId = signal<string | null>(null);
  public registering = signal<boolean>(false);
  public rejecting = signal<boolean>(false);
  public registerAttempted = signal<boolean>(false);
  public formError = signal<string | null>(null);

  public registerProcessClass = signal('');
  public registerLawyerRole = signal<ManualRegistrationLawyerRole | ''>('');
  public registerCourt = signal('');
  public registerSpeaker = signal('');
  public registerSubclassProcess = signal('');
  public registerLocation = signal('');
  public plaintiffs = signal<SubjectFormRow[]>([]);
  public defendants = signal<SubjectFormRow[]>([]);
  public otherSubjects = signal<SubjectFormRow[]>([]);

  public confirmOpen = signal<boolean>(false);
  public pendingReject = signal<ManualRegistrationRequest | null>(null);

  public readonly pageSizeOptions = [10, 20, 25, 50, 100] as const;
  public readonly partySections: { group: PartyGroup; titleKey: string; required: boolean }[] = [
    { group: 'plaintiffs', titleKey: 'manualRegistrations.detail.plaintiffs', required: true },
    { group: 'defendants', titleKey: 'manualRegistrations.detail.defendants', required: true },
    { group: 'otherSubjects', titleKey: 'manualRegistrations.detail.otherSubjects', required: false },
  ];

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
            const updated = data.find((row) => row.id === selectedId);
            if (!updated) {
              this.closeDetail();
            } else {
              this.selectedRequest.set(updated);
            }
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

  goToRegisteredProcess(): void {
    const id = this.toastProcessId()?.trim();
    if (!id) return;
    this.toastMessage.set(null);
    this.toastProcessId.set(null);
    void this._router.navigate([ROUTES_ADMIN.PROCESSES, id]);
  }

  openDetail(item: ManualRegistrationRequest, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedRequest.set(item);
    this._hydrateRegisterForm(item);
  }

  closeDetail(): void {
    this.selectedRequest.set(null);
    this.formError.set(null);
    this.registerAttempted.set(false);
    this.registering.set(false);
  }

  onProcessClassInput(event: Event): void {
    this.registerProcessClass.set((event.target as HTMLInputElement).value);
  }

  onLawyerRoleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.registerLawyerRole.set(value === 'plaintiff' || value === 'defendant' ? value : '');
  }

  onCourtInput(event: Event): void {
    this.registerCourt.set((event.target as HTMLInputElement).value);
  }

  onSpeakerInput(event: Event): void {
    this.registerSpeaker.set((event.target as HTMLInputElement).value);
  }

  onSubclassProcessInput(event: Event): void {
    this.registerSubclassProcess.set((event.target as HTMLInputElement).value);
  }

  onLocationInput(event: Event): void {
    this.registerLocation.set((event.target as HTMLInputElement).value);
  }

  rowsOf(group: PartyGroup): SubjectFormRow[] {
    if (group === 'plaintiffs') return this.plaintiffs();
    if (group === 'defendants') return this.defendants();
    return this.otherSubjects();
  }

  addSubject(group: PartyGroup): void {
    this._partySignal(group).update((rows) => [...rows, { name: '', identification: '' }]);
  }

  removeSubject(group: PartyGroup, index: number): void {
    this._partySignal(group).update((rows) => {
      if (group !== 'otherSubjects' && rows.length <= 1) return rows;
      return rows.filter((_, i) => i !== index);
    });
  }

  canRemoveSubject(group: PartyGroup): boolean {
    if (group === 'otherSubjects') return this.otherSubjects().length > 0;
    return this._partySignal(group)().length > 1;
  }

  updateSubject(group: PartyGroup, index: number, field: keyof SubjectFormRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this._partySignal(group).update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
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

  submitRegister(): void {
    const item = this.selectedRequest();
    if (!item || item.status !== 'pending' || this.registering()) return;

    this.registerAttempted.set(true);
    this.formError.set(null);

    const payload = this._buildRegisterPayload();
    const clientError = this._clientRegisterError(payload);
    if (clientError || !payload.lawyer_role || !payload.process_class) {
      this.formError.set(clientError || this._transloco.translate('manualRegistrations.registerError'));
      return;
    }

    this.registering.set(true);
    const body: RegisterManualRegistrationPayload = {
      process_class: payload.process_class,
      lawyer_role: payload.lawyer_role,
      plaintiffs: payload.plaintiffs,
      defendants: payload.defendants,
      other_subjects: payload.other_subjects,
    };
    if (payload.court) body.court = payload.court;
    if (payload.speaker) body.speaker = payload.speaker;
    if (payload.subclass_process) body.subclass_process = payload.subclass_process;
    if (payload.location) body.location = payload.location;

    this._service.register(item.id, body).subscribe({
      next: (response) => {
        this.registering.set(false);
        const message =
          response.message?.trim() || this._transloco.translate('manualRegistrations.registerSuccess');
        this._showToast(message, 'success', response.process_id);
        this.closeDetail();
        const page = this.pagination()?.current_page ?? 1;
        this.loadRequests(page);
      },
      error: (err: HttpErrorResponse) => {
        this.registering.set(false);
        this.formError.set(this._apiErrorMessage(err, 'manualRegistrations.registerError'));
      },
    });
  }

  openRejectConfirm(item: ManualRegistrationRequest, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.pendingReject.set(item);
    this.confirmOpen.set(true);
  }

  onCancelReject(): void {
    this.confirmOpen.set(false);
    this.pendingReject.set(null);
  }

  getConfirmTitle(): string {
    return this._transloco.translate('manualRegistrations.confirm.rejectedTitle');
  }

  getConfirmMessage(): string {
    return this._transloco.translate('manualRegistrations.confirm.rejectedMessage');
  }

  getConfirmLabel(): string {
    return this._transloco.translate('manualRegistrations.actions.reject');
  }

  getConfirmDetailRows(): ConfirmationDialogDetailRow[] {
    const pending = this.pendingReject();
    if (!pending) return [];
    return [
      {
        label: this._transloco.translate('manualRegistrations.table.processNumber'),
        value: pending.process_number,
      },
      {
        label: this._transloco.translate('manualRegistrations.table.organization'),
        value: pending.organization_name || '–',
      },
    ];
  }

  onConfirmReject(): void {
    const pending = this.pendingReject();
    if (!pending || this.rejecting()) return;

    this.rejecting.set(true);
    this.confirmOpen.set(false);
    this.pendingReject.set(null);

    this._service.resolve(pending.id, { status: 'rejected' }).subscribe({
      next: (response) => {
        this.rejecting.set(false);
        this._showToast(
          response.message?.trim() || this._transloco.translate('manualRegistrations.resolveRejected'),
          'success'
        );
        this.closeDetail();
        const page = this.pagination()?.current_page ?? 1;
        this.loadRequests(page);
      },
      error: (err: HttpErrorResponse) => {
        this.rejecting.set(false);
        this.formError.set(this._apiErrorMessage(err, 'manualRegistrations.resolveError'));
        this._showToast(this._apiErrorMessage(err, 'manualRegistrations.resolveError'), 'error');
      },
    });
  }

  private _partySignal(group: PartyGroup) {
    if (group === 'plaintiffs') return this.plaintiffs;
    if (group === 'defendants') return this.defendants;
    return this.otherSubjects;
  }

  private _hydrateRegisterForm(item: ManualRegistrationRequest): void {
    this.formError.set(null);
    this.registerAttempted.set(false);
    this.registerProcessClass.set((item.process_class || '').trim());
    this.registerLawyerRole.set(item.lawyer_role === 'plaintiff' || item.lawyer_role === 'defendant' ? item.lawyer_role : '');
    this.registerCourt.set((item.court || '').trim());
    this.registerSpeaker.set((item.speaker || '').trim());
    this.registerSubclassProcess.set((item.subclass_process || '').trim());
    this.registerLocation.set((item.location || '').trim());
    this.plaintiffs.set(this._subjectRows(item.plaintiffs, 1));
    this.defendants.set(this._subjectRows(item.defendants, 1));
    this.otherSubjects.set(this._subjectRows(item.other_subjects, 0));
  }

  private _subjectRows(
    list: ManualRegistrationSubject[] | null | undefined,
    min: number
  ): SubjectFormRow[] {
    const rows = this.subjectsOf(list).map((s) => ({
      name: (s.name || '').trim(),
      identification: (s.identification || '').trim(),
    }));
    while (rows.length < min) {
      rows.push({ name: '', identification: '' });
    }
    return rows;
  }

  private _mapSubjectPayload(rows: SubjectFormRow[]): ManualRegistrationSubject[] {
    return rows
      .map((row) => ({
        name: row.name.trim(),
        identification: row.identification.trim(),
      }))
      .filter((row) => row.name.length > 0)
      .map((row) =>
        row.identification
          ? { name: row.name, identification: row.identification }
          : { name: row.name, identification: null }
      );
  }

  private _buildRegisterPayload(): Partial<RegisterManualRegistrationPayload> & {
    plaintiffs: ManualRegistrationSubject[];
    defendants: ManualRegistrationSubject[];
    other_subjects: ManualRegistrationSubject[];
  } {
    const role = this.registerLawyerRole();
    return {
      process_class: this.registerProcessClass().trim(),
      lawyer_role: role === 'plaintiff' || role === 'defendant' ? role : undefined,
      court: this._optionalText(this.registerCourt()),
      speaker: this._optionalText(this.registerSpeaker()),
      subclass_process: this._optionalText(this.registerSubclassProcess()),
      location: this._optionalText(this.registerLocation()),
      plaintiffs: this._mapSubjectPayload(this.plaintiffs()),
      defendants: this._mapSubjectPayload(this.defendants()),
      other_subjects: this._mapSubjectPayload(this.otherSubjects()),
    };
  }

  private _optionalText(value: string): string | undefined {
    const trimmed = value.trim().slice(0, ManualRegistrationsComponent._OPTIONAL_TEXT_MAX);
    return trimmed || undefined;
  }

  private _clientRegisterError(
    payload: Partial<RegisterManualRegistrationPayload> & {
      plaintiffs: ManualRegistrationSubject[];
      defendants: ManualRegistrationSubject[];
    }
  ): string | null {
    if (!payload.process_class?.trim()) {
      return this._transloco.translate('manualRegistrations.form.processClassRequired');
    }
    if (payload.lawyer_role !== 'plaintiff' && payload.lawyer_role !== 'defendant') {
      return this._transloco.translate('manualRegistrations.form.lawyerRoleRequired');
    }
    if (payload.plaintiffs.length < 1) {
      return this._transloco.translate('manualRegistrations.form.plaintiffsRequired');
    }
    if (payload.defendants.length < 1) {
      return this._transloco.translate('manualRegistrations.form.defendantsRequired');
    }
    return null;
  }

  private _apiErrorMessage(err: HttpErrorResponse, fallbackKey: string): string {
    const body = err.error as { message?: string; errors?: Record<string, string[] | string> } | undefined;
    const fieldErrors = body?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const msgs = Object.values(fieldErrors)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0);
      if (msgs.length > 0) {
        const unique = [...new Set(msgs)];
        const header = typeof body?.message === 'string' ? body.message.trim() : '';
        if (header && !unique.includes(header)) {
          return [header, ...unique].join(' ');
        }
        return unique.join(' ');
      }
    }
    if (typeof body?.message === 'string' && body.message.trim()) {
      return body.message.trim();
    }
    return this._transloco.translate(fallbackKey);
  }

  private _showToast(message: string, kind: 'success' | 'error', processId?: string | null): void {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.toastMessage.set(message);
    this.toastKind.set(kind);
    this.toastProcessId.set(kind === 'success' ? processId?.trim() || null : null);
    this._toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
      this.toastProcessId.set(null);
      this._toastTimer = null;
    }, processId ? 8000 : 3200);
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
      this.openDetail(item);
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
