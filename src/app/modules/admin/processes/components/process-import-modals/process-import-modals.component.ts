import { ChangeDetectionStrategy, Component, computed, inject, output, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ProcessService } from '@app/core/services/process/process.service';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  ActuacionesImportResponse,
  ProcessActuacionSkippedItem,
  ProcessImportBatchResponse,
} from '@app/core/models/process/process.model';
import { ProcessDataSource } from '@app/core/models/process/process-data-source.model';
import { Organization } from '@app/core/models/organization/organization.model';
import { FileDropZoneComponent } from '@app/shared/components/file-drop-zone/file-drop-zone.component';
import { BottomSheetModalComponent } from '@app/shared/components/bottom-sheet-modal/bottom-sheet-modal.component';
import { SearchableSelectComponent } from '@app/shared/components/searchable-select/searchable-select.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-process-import-modals',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoPipe,
    FileDropZoneComponent,
    BottomSheetModalComponent,
    SearchableSelectComponent,
    ProcessNumberPipe,
    ConfirmationDialogComponent,
  ],
  templateUrl: './process-import-modals.component.html',
  styleUrls: ['./process-import-modals.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessImportModalsComponent {
  private _processService = inject(ProcessService);
  private _organizationService = inject(OrganizationService);
  private _transloco = inject(TranslocoService);

  dismissed = output<void>();
  actuacionesImported = output<void>();

  public copyToast = signal<{ message: string; kind: 'success' | 'error' } | null>(null);
  private _copyToastTimer: ReturnType<typeof setTimeout> | undefined;

  public isImportModalOpen = signal<boolean>(false);
  public importSubmitting = signal<boolean>(false);
  public importResult = signal<ProcessImportBatchResponse | null>(null);
  public importFile = signal<File | null>(null);
  public importOrganizationId = signal<string>('');
  public importConfirmOpen = signal<boolean>(false);
  public importOrganizations = signal<Organization[]>([]);
  public importOrganizationsLoading = signal<boolean>(false);
  public importIsPrivate = signal<boolean>(false);
  public importDataSourceSlug = signal<string>('');
  public importDataSources = signal<ProcessDataSource[]>([]);
  public importDataSourcesLoading = signal<boolean>(false);
  public importHintProcessNumber = signal<string>('');

  public isActuacionesImportModalOpen = signal<boolean>(false);
  public actuacionesImportSubmitting = signal<boolean>(false);
  public actuacionesImportResult = signal<ActuacionesImportResponse | null>(null);
  public actuacionesImportFile = signal<File | null>(null);
  public actuacionesImportFieldErrors = signal<{ file?: string }>({});
  public actuacionesSkippedOpen = signal<boolean>(false);

  private static readonly PRIVATE_DATA_SOURCE_SLUGS = ['publicaciones_procesales', 'samai'] as const;
  private static readonly API_DATA_SOURCE_SLUGS = ['judicial_branch', 'samai'] as const;

  public importOrganizationOptions = computed(() =>
    this.importOrganizations().map((o) => ({ id: o.id, label: o.name }))
  );

  public importDataSourceOptions = computed(() => {
    const allowed = this.importIsPrivate()
      ? ProcessImportModalsComponent.PRIVATE_DATA_SOURCE_SLUGS
      : ProcessImportModalsComponent.API_DATA_SOURCE_SLUGS;
    return this.importDataSources()
      .filter((s) => s.is_active && (allowed as readonly string[]).includes(s.slug))
      .map((s) => ({ id: s.slug, label: s.name }));
  });

  public importReadyToConfirm = computed(() => {
    if (this.importSubmitting()) return false;
    if (!this.importFile()) return false;
    if (!this.importOrganizationId()?.trim()) return false;
    if (this.importDataSourcesLoading()) return false;
    return !!this.importDataSourceSlug()?.trim();
  });

  public actuacionesImportReady = computed(() => {
    if (this.actuacionesImportSubmitting()) return false;
    return !!this.actuacionesImportFile();
  });

  openExcel(options?: { isPrivate?: boolean; organizationId?: string; processNumber?: string }): void {
    this.importFile.set(null);
    this.importResult.set(null);
    this.importOrganizationId.set(options?.organizationId?.trim() || '');
    this.importIsPrivate.set(options?.isPrivate === true);
    this.importHintProcessNumber.set(options?.processNumber?.replace(/\D/g, '') || '');
    this.importDataSourceSlug.set('');
    this.importDataSources.set([]);
    this.importConfirmOpen.set(false);
    this.isImportModalOpen.set(true);
    this._loadImportOrganizations();
    this._loadImportDataSources();
  }

  closeImportModal(): void {
    this.isImportModalOpen.set(false);
    this.importConfirmOpen.set(false);
    this.importFile.set(null);
    this.importResult.set(null);
    this.importOrganizationId.set('');
    this.importIsPrivate.set(false);
    this.importDataSourceSlug.set('');
    this.importDataSources.set([]);
    this.importSubmitting.set(false);
    this.importHintProcessNumber.set('');
    this.dismissed.emit();
  }

  onImportFileSelected(file: File | null): void {
    this.importFile.set(file);
  }

  onImportPrivateChange(checked: boolean): void {
    this.importIsPrivate.set(checked);
    this._applyDefaultDataSourceSlug();
  }

  isImportResultSuccess(res: ProcessImportBatchResponse): boolean {
    if (res.errors) {
      return false;
    }
    const bid = res.batch_id?.trim() || res.import_batch_id?.trim();
    if (bid && typeof res.processes_created !== 'number') {
      return true;
    }
    return typeof res.processes_created === 'number';
  }

  getImportRowErrors(res: ProcessImportBatchResponse): { row: string; message: string }[] {
    const rows = res.errors?.rows;
    if (!rows || typeof rows !== 'object') {
      return [];
    }
    return Object.entries(rows)
      .map(([row, value]) => ({
        row,
        message: Array.isArray(value) ? value.join(' ') : String(value),
      }))
      .sort((a, b) => Number(a.row) - Number(b.row) || a.row.localeCompare(b.row));
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
    const rows: ConfirmationDialogDetailRow[] = [
      { label: this._transloco.translate('processes.import.confirmFileLabel'), value: file.name },
      {
        label: this._transloco.translate('processes.import.confirmOrganizationLabel'),
        value: this._importOrganizationDisplayName(organizationId),
      },
    ];
    const slug = this.importDataSourceSlug()?.trim();
    if (slug) {
      rows.push({
        label: this._transloco.translate('processes.import.confirmDataSourceLabel'),
        value: this._importDataSourceDisplayName(slug),
      });
    }
    return rows;
  }

  openImportConfirmDialog(): void {
    const file = this.importFile();
    const organizationId = this.importOrganizationId()?.trim();
    if (!file || !organizationId) return;
    if (!this.importDataSourceSlug()?.trim()) {
      return;
    }
    this.importConfirmOpen.set(true);
  }

  onCancelImportConfirm(): void {
    this.importConfirmOpen.set(false);
  }

  onConfirmImportSubmit(): void {
    this.importConfirmOpen.set(false);
    this.executeImportSubmit();
  }

  openActuaciones(): void {
    this.actuacionesImportFile.set(null);
    this.actuacionesImportResult.set(null);
    this.actuacionesImportFieldErrors.set({});
    this.actuacionesImportSubmitting.set(false);
    this.actuacionesSkippedOpen.set(false);
    this.isActuacionesImportModalOpen.set(true);
  }

  closeActuacionesImportModal(): void {
    this.isActuacionesImportModalOpen.set(false);
    this.actuacionesImportFile.set(null);
    this.actuacionesImportResult.set(null);
    this.actuacionesImportFieldErrors.set({});
    this.actuacionesImportSubmitting.set(false);
    this.actuacionesSkippedOpen.set(false);
    this.dismissed.emit();
  }

  onActuacionesImportFileSelected(file: File | null): void {
    this.actuacionesImportFile.set(file);
    this.actuacionesImportFieldErrors.update((e) => {
      const next = { ...e };
      delete next.file;
      return next;
    });
  }

  isActuacionesImportSuccess(res: ActuacionesImportResponse): boolean {
    if (res.errors) return false;
    return (
      !!res.import_batch_id ||
      typeof res.actions_imported === 'number' ||
      typeof res.unassigned_count === 'number'
    );
  }

  isActuacionesImportOnlyUnassigned(res: ActuacionesImportResponse): boolean {
    return (res.actions_imported ?? 0) === 0 && (res.unassigned_count ?? 0) > 0;
  }

  getActuacionesUnassignedNumbers(res: ActuacionesImportResponse): string[] {
    const list = res.unassigned_process_numbers;
    return Array.isArray(list) && list.length > 0 ? list : [];
  }

  getActuacionesUpdatedNumbers(res: ActuacionesImportResponse): string[] {
    const list = res.processes_updated_numbers;
    return Array.isArray(list) && list.length > 0 ? list : [];
  }

  getActuacionesUnassignedCount(res: ActuacionesImportResponse): number {
    const explicit = res.unassigned_count;
    if (typeof explicit === 'number' && explicit >= 0) return explicit;
    return this.getActuacionesUnassignedNumbers(res).length;
  }

  getActuacionesSkippedActions(res: ActuacionesImportResponse): ProcessActuacionSkippedItem[] {
    const list = res.skipped_actions;
    return Array.isArray(list) ? list : [];
  }

  toggleActuacionesSkippedOpen(): void {
    this.actuacionesSkippedOpen.update((open) => !open);
  }

  getActuacionesImportRowErrors(res: ActuacionesImportResponse): { row: string; message: string }[] {
    const rows = res.errors?.rows;
    if (!rows || typeof rows !== 'object') return [];
    return Object.entries(rows)
      .map(([row, value]) => ({
        row,
        message: Array.isArray(value) ? value.join(' ') : String(value),
      }))
      .sort((a, b) => Number(a.row) - Number(b.row) || a.row.localeCompare(b.row));
  }

  getActuacionesImportSuccessMessage(res: ActuacionesImportResponse): string {
    const imported = res.actions_imported ?? 0;
    const unassignedCount = this.getActuacionesUnassignedCount(res);

    if (imported === 0 && unassignedCount > 0) {
      return this._transloco.translate('processes.actuacionesImport.successOnlyUnassigned', {
        stored: res.actions_stored_unassigned ?? 0,
        count: unassignedCount,
      });
    }

    let msg = this._transloco.translate('processes.actuacionesImport.successSummary', {
      actions: imported,
      processes: res.processes_updated ?? 0,
    });
    if ((res.actions_skipped ?? 0) > 0) {
      msg +=
        ' ' +
        this._transloco.translate('processes.actuacionesImport.successSkipped', {
          skipped: res.actions_skipped,
        });
    }
    return msg;
  }

  copyActuacionesNotFoundNumbers(numbers: string[], event?: Event): void {
    this._copyActuacionesProcessNumbers(
      numbers,
      'processes.actuacionesImport.copyNotFoundSuccess',
      event
    );
  }

  copyActuacionesUpdatedNumbers(numbers: string[], event?: Event): void {
    this._copyActuacionesProcessNumbers(
      numbers,
      'processes.actuacionesImport.copyUpdatedSuccess',
      event
    );
  }

  copyProcessRadicado(raw: string | null | undefined, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const clean = (raw ?? '').replace(/\D/g, '');
    if (!clean) return;
    this._writeClipboard(
      clean,
      this._transloco.translate('processes.copy.toastSuccess'),
      this._transloco.translate('processes.copy.toastError')
    );
  }

  submitActuacionesImport(): void {
    const file = this.actuacionesImportFile();
    if (!file) return;

    this.actuacionesImportSubmitting.set(true);
    this.actuacionesImportResult.set(null);
    this.actuacionesImportFieldErrors.set({});

    this._processService.importActuaciones(file).subscribe({
      next: (response) => {
        const unassigned = Array.isArray(response.unassigned_process_numbers)
          ? response.unassigned_process_numbers
          : [];
        const updatedNumbers = Array.isArray(response.processes_updated_numbers)
          ? response.processes_updated_numbers
          : [];
        const skipped = Array.isArray(response.skipped_actions) ? response.skipped_actions : [];
        this.actuacionesImportResult.set({
          ...response,
          actions_imported: response.actions_imported ?? 0,
          actions_skipped: response.actions_skipped ?? skipped.length,
          actions_stored_unassigned: response.actions_stored_unassigned ?? 0,
          processes_updated: response.processes_updated ?? updatedNumbers.length,
          processes_updated_numbers: updatedNumbers,
          unassigned_count: response.unassigned_count ?? unassigned.length,
          unassigned_process_numbers: unassigned,
          skipped_actions: skipped,
        });
        this.actuacionesSkippedOpen.set(false);
        this.actuacionesImportSubmitting.set(false);
        if ((response.actions_imported ?? 0) > 0) {
          this.actuacionesImported.emit();
        }
      },
      error: (err) => {
        const body = err.error as ActuacionesImportResponse | undefined;
        const errors = body?.errors;

        if (errors && !errors.rows && errors.file) {
          this.actuacionesImportFieldErrors.set({
            file: this._firstErrorMessage(errors.file),
          });
          this.actuacionesImportSubmitting.set(false);
          return;
        }

        this.actuacionesImportResult.set({
          message:
            body?.message ||
            this._transloco.translate('processes.actuacionesImport.errors.generic'),
          actions_imported: 0,
          actions_skipped: 0,
          actions_stored_unassigned: 0,
          processes_updated: 0,
          processes_updated_numbers: [],
          unassigned_count: 0,
          unassigned_process_numbers: [],
          skipped_actions: [],
          import_batch_id: body?.import_batch_id,
          errors: errors ?? { file: body?.message || 'failed' },
        });
        this.actuacionesImportSubmitting.set(false);
      },
    });
  }

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

  private _loadImportDataSources(): void {
    this.importDataSourcesLoading.set(true);
    this._processService.getProcessDataSources().subscribe({
      next: (list) => {
        this.importDataSources.set(Array.isArray(list) ? list : []);
        this.importDataSourcesLoading.set(false);
        this._applyDefaultDataSourceSlug();
      },
      error: () => {
        this.importDataSources.set([]);
        this.importDataSourcesLoading.set(false);
        this.importDataSourceSlug.set('');
      },
    });
  }

  private _applyDefaultDataSourceSlug(): void {
    const options = this.importDataSourceOptions();
    if (!options.length) {
      this.importDataSourceSlug.set('');
      return;
    }
    const preferred = this.importIsPrivate() ? 'publicaciones_procesales' : 'judicial_branch';
    const match = options.find((o) => o.id === preferred);
    this.importDataSourceSlug.set(match?.id ?? options[0].id);
  }

  private executeImportSubmit(): void {
    const file = this.importFile();
    const organizationId = this.importOrganizationId()?.trim();
    const dataSourceSlug = this.importDataSourceSlug()?.trim();
    if (!file || !organizationId || !dataSourceSlug) return;

    const isPrivate = this.importIsPrivate();
    this.importSubmitting.set(true);
    this.importResult.set(null);

    const request$ = isPrivate
      ? this._processService.importPrivateProcesses(file, organizationId, dataSourceSlug)
      : this._processService.importProcesses(file, organizationId, dataSourceSlug);

    request$.subscribe({
      next: (response) => {
        this.importResult.set(response);
        this.importSubmitting.set(false);
      },
      error: (err) => {
        const body = err.error;
        const message = body?.message || this._transloco.translate('processes.import.errors.generic');
        this.importResult.set({
          message,
          import_batch_id: body?.import_batch_id,
          errors: body?.errors,
        });
        this.importSubmitting.set(false);
      },
    });
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

  private _copyActuacionesProcessNumbers(numbers: string[], successKey: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const text = (numbers ?? [])
      .map((n) => (n ?? '').replace(/\D/g, ''))
      .filter(Boolean)
      .join('\n');
    if (!text) return;
    this._writeClipboard(text, this._transloco.translate(successKey), this._transloco.translate('processes.copy.toastError'));
  }

  private _writeClipboard(text: string, successMessage: string, errorMessage: string): void {
    if (this._copyToastTimer) {
      clearTimeout(this._copyToastTimer);
      this._copyToastTimer = undefined;
    }
    const dismiss = (): void => {
      this.copyToast.set(null);
      this._copyToastTimer = undefined;
    };
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.copyToast.set({ message: successMessage, kind: 'success' });
        this._copyToastTimer = setTimeout(() => dismiss(), 2200);
      })
      .catch(() => {
        this.copyToast.set({ message: errorMessage, kind: 'error' });
        this._copyToastTimer = setTimeout(() => dismiss(), 2200);
      });
  }

  private _firstErrorMessage(value: string | string[] | undefined): string | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }
}
