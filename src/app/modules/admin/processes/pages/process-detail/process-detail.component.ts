import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthenticatedLayoutComponent } from '@app/layout/layouts/authenticated/authenticated.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { DataTableComponent, DataTableColumn } from '@app/shared/components/data-table/data-table.component';
import { ProcessAlertTooltipComponent } from '@app/shared/components/process-alert-tooltip/process-alert-tooltip.component';
import { ConfirmationDialogComponent } from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

import { ProcessService } from '@app/core/services/process/process.service';
import {
  Action,
  ActionFilter,
  ActionResponseMeta,
  AlertKeyword,
  AlertKeywordStat,
  ProcessDetail,
  ProcessDetailInstance,
  ProcessInterestedOrganization,
  Subject,
  SaveProcessSubjectsResponse,
} from '@app/core/models/process/process.model';
import { buildTextWithHighlights } from '@app/core/utils/alert-highlight.utils';

import { RoleSelectionModalComponent } from '../../components/role-selection-modal/role-selection-modal.component';
import { SubjectFormModalComponent } from '../../components/subject-form-modal/subject-form-modal.component';

@Component({
  selector: 'app-process-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    DateRangePickerComponent,
    DataTableComponent,
    ProcessNumberPipe,
    ProcessAlertTooltipComponent,
    RoleSelectionModalComponent,
    SubjectFormModalComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './process-detail.component.html',
  styleUrls: ['./process-detail.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessDetailComponent {
  private _processService = inject(ProcessService);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _fb = inject(FormBuilder);
  private _destroyRef = inject(DestroyRef);
  private _transloco = inject(TranslocoService);
  private _layout = inject(AuthenticatedLayoutComponent, { optional: true });

  // State
  public process = signal<ProcessDetail | null>(null);
  public processInstances = signal<ProcessDetailInstance[]>([]);
  public loadingInstances = signal<boolean>(false);
  public subjects = signal<Subject[]>([]);
  public organizations = signal<ProcessInterestedOrganization[]>([]);
  private _organizationsApiCount = signal(0);
  public organizationsCount = computed(() =>
    Math.max(this._organizationsApiCount(), this.organizations().length)
  );
  public hasOrganizations = computed(() => this.organizationsCount() > 0);

  /** Acordeón activo en el detalle */
  public accordionSection = signal<'organizations' | 'general' | 'subjects' | 'actions'>('general');
  public plaintiffSubjects = computed(() =>
    this.subjects().filter((s) => this.isPlaintiffSubject(s))
  );
  public defendantSubjects = computed(() =>
    this.subjects().filter((s) => this.isDefendantSubject(s))
  );
  /** Sujetos cuyo tipo no es demandante ni demandado (p. ej. Opositor, Recurrente casación) */
  public otherSubjects = computed(() =>
    this.subjects().filter((s) => !this.isPlaintiffSubject(s) && !this.isDefendantSubject(s))
  );
  /** Layout de dos columnas solo cuando hay al menos un demandante o demandado */
  public hasClassicSubjectLayout = computed(
    () => this.plaintiffSubjects().length > 0 || this.defendantSubjects().length > 0
  );
  public actions = signal<Action[]>([]);
  public loading = signal<boolean>(false);
  public loadingActions = signal<boolean>(false);
  public error = signal<string | null>(null);
  public actionsPagination = signal<ActionResponseMeta | null>(null);

  /** Palabras clave de alerta para filtrar actuaciones (desde processes/:id/alert-keywords) */
  public alertKeywords = signal<AlertKeyword[]>([]);
  /** Conteo por palabra clave (desde processes/:id/alert-keyword-stats) */
  public alertKeywordStats = signal<AlertKeywordStat[]>([]);
  /** Estado inicial del proceso (para mantener el status_label original) */
  public initialStatusLabel = signal<string>('');

  /** Estado del mensaje de copiado */
  public copiedMessage = signal<string | null>(null);
  /** Estado del toast (para otros mensajes) */
  public toastVisible = signal<boolean>(false);
  public toastType = signal<'success' | 'error'>('success');
  public toastMessage = signal<string>('');

  /** Modal de asignación de rol por organización */
  public showOrganizationRoleModal = signal<boolean>(false);
  public selectedOrganizationForRole = signal<ProcessInterestedOrganization | null>(null);

  /** Confirmación de activar/desactivar seguimiento por organización */
  public confirmOrganizationStatusOpen = signal<boolean>(false);
  public selectedOrganizationForStatus = signal<ProcessInterestedOrganization | null>(null);
  public confirmOrganizationStatusAction = signal<'activate' | 'deactivate'>('deactivate');
  public updatingOrganizationStatusId = signal<string | null>(null);

  /** Modal crear/editar sujeto procesal */
  public showSubjectModal = signal<boolean>(false);
  public selectedSubjectForEdit = signal<Subject | null>(null);

  /** Confirmación eliminar sujeto manual */
  public confirmSubjectDeleteOpen = signal<boolean>(false);
  public selectedSubjectForDelete = signal<Subject | null>(null);
  public deletingSubjectId = signal<string | null>(null);

  /** Selector de instancia en móvil */
  public showInstanceSelector = signal<boolean>(false);

  /** Instancia actualmente seleccionada */
  public selectedInstance = computed(() =>
    this.processInstances().find((instance) => instance.id === this.process()?.id)
  );

  /** Muestra el bloque de instancias si el API lo indica o si hay más de una instancia */
  public showMultipleInstancesSection = computed(() => {
    const current = this.process();
    if (!current) return false;
    if (current.has_multiple_instances) return true;
    return this.processInstances().length > 1;
  });

  // Filter form for actions
  public actionFilterForm: FormGroup = this._fb.group({
    action_date_range: [null as DateRange | null],
    registration_date_range: [null as DateRange | null],
    alert_slug: [null as string | null],
    search: [''],
  });

  // Table columns for actions
  public actionColumns: DataTableColumn[] = [];

  constructor() {
    const formatDateFn = (value: string | null | undefined): string => {
      return this.formatDate(value);
    };

    const formatTermDate = (value: string | null | undefined): string => {
      if (value == null || String(value).trim() === '' || String(value).trim() === '-') return '–';
      return String(value).trim();
    };

    this.actionColumns = [
      {
        key: 'index',
        label: 'processDetail.actions.table.index',
        width: '56px',
        align: 'center',
        render: (value: number | undefined) => (value != null ? String(value) : '–'),
      },
      {
        key: 'action',
        label: 'processDetail.actions.table.action',
        sortable: true,
        html: true,
        render: (value: string | null, row: Action) => {
          const mainAction = row.action ?? value;
          const related = row.related_action;

          const actionHtml = buildTextWithHighlights(mainAction, row.alert_highlights as any, 'action');

          if (related) {
            const relatedActionHtml = buildTextWithHighlights(related.action ?? '', related.alert_highlights as any, 'action');
            const lowerAction = mainAction?.toLowerCase() || '';
            const badgeLabel =
              lowerAction.includes('notificacion') || lowerAction.includes('notificación') ? 'Notificación' : 'Fijación';

            return `
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1.5">
                   <span class="badge badge-sm bg-primary/10 text-primary border-none font-bold text-[9px] px-1.5 h-4 uppercase tracking-tighter">${badgeLabel}</span>
                   <div class="font-bold text-base-content/90 leading-tight">${actionHtml}</div>
                </div>
                <div class="flex items-center gap-1.5">
                   <span class="badge badge-sm bg-accent/10 text-accent border-none font-bold text-[9px] px-1.5 h-4 uppercase tracking-tighter">Auto</span>
                   <div class="font-bold text-base-content leading-tight">${relatedActionHtml}</div>
                </div>
              </div>
            `;
          }
          return actionHtml;
        },
      },
      {
        key: 'annotation',
        label: 'processDetail.actions.table.annotation',
        html: true,
        render: (value: string | null, row: Action) => {
          const related = row.related_action;
          let annotationToUse = row.annotation ?? value;
          let highlightsToUse = row.alert_highlights;

          if (related && related.annotation && related.annotation !== '---' && related.annotation !== '–') {
            annotationToUse = related.annotation;
            highlightsToUse = related.alert_highlights;
          }

          if (!annotationToUse || annotationToUse === '---' || annotationToUse === '–') return '–';
          return buildTextWithHighlights(annotationToUse, highlightsToUse as any, 'annotation');
        },
      },
      {
        key: 'term_start_date',
        label: 'processDetail.actions.table.termStartDate',
        width: '140px',
        align: 'center',
        render: formatTermDate,
      },
      {
        key: 'term_end_date',
        label: 'processDetail.actions.table.termEndDate',
        width: '140px',
        align: 'center',
        render: formatTermDate,
      },
      {
        key: 'action_date',
        label: 'processDetail.actions.table.actionDate',
        width: '150px',
        align: 'center',
        render: formatDateFn,
      },
      {
        key: 'registration_date',
        label: 'processDetail.actions.table.registrationDate',
        width: '150px',
        align: 'center',
        render: formatDateFn,
      },
    ];

    this._route.paramMap.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      const id = params.get('id');
      this.loadProcessDetail(id);
    });
  }

  public openOrganizationRoleModal(org: ProcessInterestedOrganization): void {
    this.selectedOrganizationForRole.set(org);
    this.showOrganizationRoleModal.set(true);
  }

  public closeOrganizationRoleModal(): void {
    this.showOrganizationRoleModal.set(false);
    this.selectedOrganizationForRole.set(null);
  }

  public onOrganizationRoleSaved(): void {
    const processId = this.process()?.id;
    this.closeOrganizationRoleModal();
    if (processId) {
      this.loadProcessDetail(processId);
    }
    this.showToast('success', this._transloco.translate('processDetail.organizations.roleSaved'));
  }

  public openCreateSubjectModal(): void {
    this.selectedSubjectForEdit.set(null);
    this.showSubjectModal.set(true);
    this.accordionSection.set('subjects');
  }

  public openEditSubjectModal(subject: Subject): void {
    this.selectedSubjectForEdit.set(subject);
    this.showSubjectModal.set(true);
    this.accordionSection.set('subjects');
  }

  public closeSubjectModal(): void {
    this.showSubjectModal.set(false);
    this.selectedSubjectForEdit.set(null);
  }

  public onSubjectSaved(response: SaveProcessSubjectsResponse): void {
    this.closeSubjectModal();
    const processId = this.process()?.id;
    if (processId) {
      this.loadProcessDetail(processId, 'subjects');
    } else {
      this.subjects.set(response.subjects ?? []);
    }
    this.showToast('success', response.message || this._transloco.translate('processDetail.subjects.saved'));
  }

  public isSubjectManual(subject: Subject): boolean {
    if (typeof subject.is_manual === 'boolean') {
      return subject.is_manual;
    }
    return subject.subject_registration_id == null;
  }

  public getSubjectSourceBadgeClass(subject: Subject): string {
    return this.isSubjectManual(subject)
      ? 'badge badge-outline badge-sm font-bold text-[9px] uppercase tracking-wider border-warning/40 text-warning'
      : 'badge badge-outline badge-sm font-bold text-[9px] uppercase tracking-wider border-info/40 text-info';
  }

  public getSubjectSourceLabelKey(subject: Subject): string {
    return this.isSubjectManual(subject)
      ? 'processDetail.subjects.badgeManual'
      : 'processDetail.subjects.badgeJudicial';
  }

  public canDeleteSubject(subject: Subject): boolean {
    if (subject.is_manual === true) {
      return true;
    }
    if (subject.is_manual === false) {
      return false;
    }
    return subject.subject_registration_id == null;
  }

  public openDeleteSubjectConfirm(subject: Subject): void {
    if (!this.canDeleteSubject(subject)) return;
    this.selectedSubjectForDelete.set(subject);
    this.confirmSubjectDeleteOpen.set(true);
  }

  public getConfirmSubjectDeleteTitle(): string {
    return this._transloco.translate('processDetail.subjects.deleteConfirmTitle');
  }

  public getConfirmSubjectDeleteMessage(): string {
    const subject = this.selectedSubjectForDelete();
    if (!subject) return '';
    return this._transloco.translate('processDetail.subjects.deleteConfirmMessage', {
      name: subject.name_or_business_name,
    });
  }

  public onCancelSubjectDelete(): void {
    this.confirmSubjectDeleteOpen.set(false);
    this.selectedSubjectForDelete.set(null);
  }

  public onConfirmSubjectDelete(): void {
    const process = this.process();
    const subject = this.selectedSubjectForDelete();
    if (!process || !subject) return;

    this.confirmSubjectDeleteOpen.set(false);
    this.deletingSubjectId.set(subject.id);

    this._processService.deleteProcessSubject(process.id, subject.id).subscribe({
      next: (response) => {
        this.selectedSubjectForDelete.set(null);
        this.deletingSubjectId.set(null);
        this.loadProcessDetail(process.id, 'subjects');
        this.showToast('success', response.message || this._transloco.translate('processDetail.subjects.deleted'));
      },
      error: (err) => {
        this.selectedSubjectForDelete.set(null);
        this.deletingSubjectId.set(null);
        const body = err?.error;
        const message =
          typeof body?.message === 'string'
            ? body.message
            : this._transloco.translate('processDetail.subjects.deleteError');
        this.showToast('error', message);
      },
    });
  }

  public isOrganizationActive(org: ProcessInterestedOrganization): boolean {
    if (typeof org.is_active === 'boolean') {
      return org.is_active;
    }

    const status = (org.status_label || org.status || '').toLowerCase();
    return !status.includes('inactivo') && !status.includes('inactive');
  }

  public isOrganizationInactive(org: ProcessInterestedOrganization): boolean {
    return !this.isOrganizationActive(org);
  }

  public openOrganizationStatusConfirm(org: ProcessInterestedOrganization): void {
    const isActive = this.isOrganizationActive(org);
    this.selectedOrganizationForStatus.set(org);
    this.confirmOrganizationStatusAction.set(isActive ? 'deactivate' : 'activate');
    this.confirmOrganizationStatusOpen.set(true);
  }

  public getConfirmOrganizationStatusTitle(): string {
    const key =
      this.confirmOrganizationStatusAction() === 'deactivate'
        ? 'processDetail.organizations.confirmDeactivateTitle'
        : 'processDetail.organizations.confirmActivateTitle';
    return this._transloco.translate(key);
  }

  public getConfirmOrganizationStatusMessage(): string {
    const org = this.selectedOrganizationForStatus();
    if (!org) return '';

    const key =
      this.confirmOrganizationStatusAction() === 'deactivate'
        ? 'processDetail.organizations.confirmDeactivateMessage'
        : 'processDetail.organizations.confirmActivateMessage';
    return this._transloco.translate(key, { name: org.name });
  }

  public onCancelOrganizationStatusChange(): void {
    this.confirmOrganizationStatusOpen.set(false);
    this.selectedOrganizationForStatus.set(null);
  }

  public onConfirmOrganizationStatusChange(): void {
    const process = this.process();
    const org = this.selectedOrganizationForStatus();
    if (!process || !org) return;

    const isActivate = this.confirmOrganizationStatusAction() === 'activate';
    this.confirmOrganizationStatusOpen.set(false);
    this.updatingOrganizationStatusId.set(org.id);

    this._processService.updateOrganizationProcessStatus(process.id, org.id, isActivate).subscribe({
      next: (response) => {
        this.selectedOrganizationForStatus.set(null);
        this.updatingOrganizationStatusId.set(null);
        this.showToast('success', response.message || this._transloco.translate('processDetail.organizations.statusSaved'));
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      },
      error: () => {
        this.selectedOrganizationForStatus.set(null);
        this.updatingOrganizationStatusId.set(null);
        this.showToast('error', this._transloco.translate('processDetail.organizations.statusError'));
      },
    });
  }

  public getOrganizationRoleLabel(org: ProcessInterestedOrganization): string {
    if (org.lawyer_role_label?.trim()) return org.lawyer_role_label.trim();
    if (org.lawyer_role?.trim()) return this.getRoleLabel(org.lawyer_role);
    return '';
  }

  loadAlertKeywords(processId: string): void {
    this._processService.getAlertKeywords(processId).subscribe({
      next: (response) => this.alertKeywords.set(response.data ?? []),
      error: () => this.alertKeywords.set([]),
    });
  }

  loadAlertKeywordStats(processId: string): void {
    this._processService.getAlertKeywordStats(processId).subscribe({
      next: (response) => this.alertKeywordStats.set(response.data ?? []),
      error: () => this.alertKeywordStats.set([]),
    });
  }

  applyAlertFilter(slug: string): void {
    this.actionFilterForm.patchValue({ alert_slug: slug });
    this.loadActions(1, this.actionsPagination()?.per_page || 10);
  }

  public viewOrganizations(): void {
    this.accordionSection.set('organizations');
    requestAnimationFrame(() => {
      document.getElementById('process-organizations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  public getOrganizationLawyerRole(org: ProcessInterestedOrganization): string | null {
    return org.lawyer_role_label ?? org.lawyer_role;
  }

  /** Rol normalizado (plaintiff/defendant) a partir de lawyer_role o lawyer_role_label */
  public normalizeOrganizationRole(org: ProcessInterestedOrganization): 'plaintiff' | 'defendant' | null {
    const sources = [org.lawyer_role, org.lawyer_role_label]
      .map((value) => (value == null ? '' : String(value).trim()))
      .filter(Boolean);

    for (const source of sources) {
      const raw = source.toLowerCase();
      if (raw === 'plaintiff' || raw.includes('demandante')) return 'plaintiff';
      if (raw === 'defendant' || raw.includes('demandado')) return 'defendant';
    }

    return null;
  }

  public hasOrganizationRole(org: ProcessInterestedOrganization): boolean {
    return this.normalizeOrganizationRole(org) !== null || !!this.getOrganizationRoleLabel(org);
  }

  /** Semáforo de inactividad (misma regla que instancias en frontend) */
  public getOrganizationInactivityAlertLevel(
    org: ProcessInterestedOrganization
  ): 'red' | 'yellow' | 'green' | null {
    const level = org.inactivity_alert_level;
    if (level === 'red' || level === 'yellow' || level === 'green') return level;
    return null;
  }

  public isOrganizationPlaintiff(org: ProcessInterestedOrganization): boolean {
    return this.normalizeOrganizationRole(org) === 'plaintiff';
  }

  public copyToClipboard(text: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (!text || text === '–') return;
    const cleanText = text.replace(/[^0-9]/g, '');
    navigator.clipboard.writeText(cleanText).then(() => {
      this.copiedMessage.set('Radicado copiado!');
      setTimeout(() => this.copiedMessage.set(null), 2500);
    });
  }

  loadProcessDetail(
    id: string | null,
    openAccordion: 'organizations' | 'general' | 'subjects' | 'actions' = 'general'
  ): void {
    if (!id) {
      this.error.set('processDetail.error.idNotFound');
      this.loading.set(false);
      return;
    }

    this.process.set(null);
    this.processInstances.set([]);
    this.subjects.set([]);
    this.organizations.set([]);
    this._organizationsApiCount.set(0);
    this.accordionSection.set(openAccordion);
    this.actions.set([]);
    this.actionsPagination.set(null);
    this.loading.set(true);
    this.error.set(null);

    this._processService.getProcessDetail(id).subscribe({
      next: (response) => {
        this.process.set(response.process);
        this.initialStatusLabel.set(response.process.status_label);
        this.subjects.set(response.subjects ?? []);
        this.organizations.set(response.organizations?.items ?? []);
        this._organizationsApiCount.set(response.organizations?.count ?? response.organizations?.items?.length ?? 0);

        this.loadProcessInstances(response.process.id);

        // Alert metadata + actions
        this.loadAlertKeywords(response.process.id);
        this.loadAlertKeywordStats(response.process.id);
        this.loadActions();

        this.loading.set(false);
      },
      error: () => {
        this.error.set('processDetail.error.loadError');
        this.loading.set(false);
      },
    });
  }

  loadProcessInstances(processId: string): void {
    this.loadingInstances.set(true);
    this._processService.getProcessInstances(processId).subscribe({
      next: (instances) => {
        this.processInstances.set(instances ?? []);
        this.loadingInstances.set(false);
      },
      error: () => {
        this.processInstances.set([]);
        this.loadingInstances.set(false);
      },
    });
  }

  isSelectedInstance(instanceId: string): boolean {
    return this.process()?.id === instanceId;
  }

  onSelectInstance(instanceId: string): void {
    if (this.isSelectedInstance(instanceId)) {
      this.showInstanceSelector.set(false);
      return;
    }
    this.showInstanceSelector.set(false);
    this._router.navigate(['/admin', 'processes', instanceId]);
  }

  toggleInstanceSelector(): void {
    this.showInstanceSelector.update((v) => !v);
  }

  loadActions(page: number = 1, perPage: number = 10): void {
    const process = this.process();
    if (!process) return;

    this.loadingActions.set(true);

    const formValue = this.actionFilterForm.value;
    const actionDateRange: DateRange | null = formValue.action_date_range;
    const registrationDateRange: DateRange | null = formValue.registration_date_range;
    const alertSlug = formValue.alert_slug?.trim();

    const filters: ActionFilter = {
      action_date_from: actionDateRange?.from && actionDateRange.from.trim() ? actionDateRange.from : undefined,
      action_date_to: actionDateRange?.to && actionDateRange.to.trim() ? actionDateRange.to : undefined,
      registration_date_from:
        registrationDateRange?.from && registrationDateRange.from.trim() ? registrationDateRange.from : undefined,
      registration_date_to:
        registrationDateRange?.to && registrationDateRange.to.trim() ? registrationDateRange.to : undefined,
      alert_slug: alertSlug || undefined,
      search: formValue.search?.trim() || undefined,
      page,
      per_page: perPage,
    };

    Object.keys(filters).forEach((key) => {
      const value = filters[key as keyof ActionFilter];
      if (value === '' || value === null || value === undefined) {
        delete filters[key as keyof ActionFilter];
      }
    });

    this._processService.getProcessActions(process.id, filters).subscribe({
      next: (response) => {
        const rawActions = response.data ?? [];
        const actionMap = new Map<string, Action>();
        rawActions.forEach((a) => actionMap.set(a.id, a));

        const finalActions: Action[] = [];
        const groupedIds = new Set<string>();

        rawActions.forEach((a) => {
          if (groupedIds.has(a.id)) return;
          const actionText = a.action?.toLowerCase() || '';
          const isNotification =
            actionText.includes('fijacion') ||
            actionText.includes('notificacion') ||
            actionText.includes('notificación') ||
            actionText.includes('estado');

          if (isNotification && a.notified_action_id) {
            const auto = actionMap.get(a.notified_action_id);
            if (auto && auto.id !== a.id) {
              a.related_action = auto;
              groupedIds.add(auto.id);
            }
          }
          finalActions.push(a);
        });

        const filteredActions = finalActions.filter((a) => !groupedIds.has(a.id));
        this.actions.set(filteredActions);

        this.actionsPagination.set({
          current_page: response.current_page,
          per_page: response.per_page,
          total: response.total - groupedIds.size,
          last_page: Math.ceil((response.total - groupedIds.size) / response.per_page),
          from: response.from,
          to: Math.min(response.to, response.total - groupedIds.size),
        });

        this.loadingActions.set(false);
      },
      error: () => {
        this.actions.set([]);
        this.actionsPagination.set(null);
        this.loadingActions.set(false);
      },
    });
  }

  onSearchActions(): void {
    this.loadActions(1, this.actionsPagination()?.per_page || 10);
  }

  onResetActionFilters(): void {
    this.actionFilterForm.reset({
      action_date_range: null,
      registration_date_range: null,
      alert_slug: null,
      search: '',
    });
    this.loadActions(1, this.actionsPagination()?.per_page || 10);
  }

  onActionsPageChange(event: { page: number; perPage: number }): void {
    this.loadActions(event.page, event.perPage);
  }

  showToast(type: 'success' | 'error', message: string): void {
    this.toastType.set(type);
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3000);
  }

  isProcessInactive(): boolean {
    const status = this.initialStatusLabel() || this.process()?.status_label;
    if (!status) return false;
    const statusLower = status.toLowerCase();
    return statusLower.includes('inactivo') || statusLower.includes('inactive');
  }

  getStatusClass(status: string): string {
    const statusLower = status.toLowerCase();

    if (statusLower.includes('inactivo') || statusLower.includes('inactive')) {
      return 'badge badge-error';
    }

    if (statusLower.includes('activo') || statusLower.includes('active')) {
      return 'badge badge-success';
    }

    return 'badge';
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  }

  formatDateSafe(value: string | null | undefined, kind: 'short' | 'shortDate' | 'onlyTime'): string {
    if (!value || !value.trim()) return '–';
    const trimmed = value.trim();
    const date = new Date(trimmed);

    if (!isNaN(date.getTime())) {
      if (kind === 'short') {
        return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
      }
      if (kind === 'onlyTime') {
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      return date.toLocaleDateString('es-ES', { year: 'numeric', day: '2-digit', month: '2-digit' });
    }

    return kind === 'onlyTime' ? '' : trimmed;
  }

  public getRoleLabel(role: string | null | undefined): string {
    if (!role) return '';
    const r = role.toLowerCase();
    if (this.isPlaintiffType(r)) return 'DEMANDANTE';
    if (this.isDefendantType(r)) return 'DEMANDADO';
    return role.toUpperCase();
  }

  public isPlaintiffSubject(subject: Subject): boolean {
    return this.isPlaintiffType(subject.subject_type?.toLowerCase() ?? '');
  }

  public isDefendantSubject(subject: Subject): boolean {
    return this.isDefendantType(subject.subject_type?.toLowerCase() ?? '');
  }

  private isPlaintiffType(type: string): boolean {
    return type === 'plaintiff' || type.includes('demandante');
  }

  private isDefendantType(type: string): boolean {
    return type === 'defendant' || type.includes('demandado');
  }
}

