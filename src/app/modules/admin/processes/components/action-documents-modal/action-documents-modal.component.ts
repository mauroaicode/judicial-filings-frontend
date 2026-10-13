import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { ProcessService } from '@app/core/services/process/process.service';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  Action,
  ActionDocument,
  ProcessInterestedOrganization,
} from '@app/core/models/process/process.model';
import { FileDropZoneComponent } from '@app/shared/components/file-drop-zone/file-drop-zone.component';
import { ConfirmationDialogComponent } from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ActionDocumentsChangedEvent =
  | { type: 'uploaded'; documents: ActionDocument[]; enabledOrganizationIds: string[] }
  | { type: 'updated'; document: ActionDocument; enabledOrganizationIds: string[] }
  | { type: 'deleted'; mediaId: number };

@Component({
  selector: 'app-action-documents-modal',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, FileDropZoneComponent, ConfirmationDialogComponent],
  templateUrl: './action-documents-modal.component.html',
  styleUrls: ['./action-documents-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionDocumentsModalComponent implements OnDestroy {
  private _processService = inject(ProcessService);
  private _organizationService = inject(OrganizationService);
  private _transloco = inject(TranslocoService);
  private _sanitizer = inject(DomSanitizer);

  public processId = input.required<string>();
  public action = input.required<Action>();
  public organizations = input<ProcessInterestedOrganization[]>([]);
  public courtName = input<string>('');
  public hasMultipleInstances = input<boolean>(false);

  public closed = output<void>();
  public changed = output<ActionDocumentsChangedEvent>();
  /** Avisa al padre para ampliar el shell mientras el visor está abierto. */
  public viewerOpenChange = output<boolean>();

  public documents = signal<ActionDocument[]>([]);
  public selectedFiles = signal<File[]>([]);
  public selectedOrgIds = signal<Set<string>>(new Set());
  /** orgId → can_view_action_documents (null = desconocido) */
  public orgCanView = signal<Record<string, boolean | null>>({});
  public loadingOrgFlags = signal(false);
  public uploading = signal(false);
  public savingAclId = signal<number | null>(null);
  public deletingId = signal<number | null>(null);
  public editingAclId = signal<number | null>(null);
  public editingAclOrgIds = signal<Set<string>>(new Set());
  public confirmDeleteId = signal<number | null>(null);
  public confirmUploadOpen = signal(false);
  public viewingDocument = signal<ActionDocument | null>(null);
  public viewerUrl = signal<SafeResourceUrl | null>(null);
  public viewerLoading = signal(false);
  public viewerError = signal<string | null>(null);
  public errorMessage = signal<string | null>(null);
  public fieldErrors = signal<Record<string, string>>({});
  private _boundActionId: string | null = null;
  /** Evita pisar la selección manual del usuario al refrescar flags. */
  private _defaultOrgSelectionApplied = false;
  private _viewerObjectUrl: string | null = null;

  public hasOrganizations = computed(() => this.organizations().length > 0);
  public canUpload = computed(() => {
    if (this.uploading()) return false;
    if (!this.selectedFiles().length) return false;
    if (!this.selectedOrgIds().size) return false;
    return true;
  });

  constructor() {
    effect(() => {
      const current = this.action();
      // Mutaciones fuera del tracking: evitar loop al leer/escribir `documents`.
      untracked(() => {
        if (this._boundActionId !== current.id) {
          this._boundActionId = current.id;
          this.documents.set([...(current.documents ?? [])]);
          this.selectedFiles.set([]);
          this.selectedOrgIds.set(new Set());
          this.orgCanView.set({});
          this._defaultOrgSelectionApplied = false;
          this.editingAclId.set(null);
          this.editingAclOrgIds.set(new Set());
          this.confirmDeleteId.set(null);
          this.confirmUploadOpen.set(false);
          this._closeViewer();
          this.errorMessage.set(null);
          this.fieldErrors.set({});
          return;
        }
        const incoming = current.documents ?? [];
        if (incoming.length !== this.documents().length) {
          this.documents.set([...incoming]);
        }
      });
    });

    effect(() => {
      const orgs = this.organizations();
      // `_loadOrgViewFlags` lee y escribe `orgCanView` → sin untracked congela el tab.
      untracked(() => this._loadOrgViewFlags(orgs));
    });
  }

  ngOnDestroy(): void {
    this._revokeViewerUrl();
  }

  public onClose(): void {
    if (
      this.uploading() ||
      this.savingAclId() != null ||
      this.deletingId() != null ||
      this.confirmUploadOpen() ||
      this.viewerLoading()
    ) {
      return;
    }
    this._closeViewer();
    this.closed.emit();
  }

  public openViewer(doc: ActionDocument): void {
    if (this.viewerLoading() || this.uploading()) return;

    this._revokeViewerUrl();
    this.viewingDocument.set(doc);
    this.viewerUrl.set(null);
    this.viewerError.set(null);
    this.viewerLoading.set(true);
    this.viewerOpenChange.emit(true);

    this._processService
      .downloadMediaBlob(doc.id)
      .pipe(finalize(() => this.viewerLoading.set(false)))
      .subscribe({
        next: (blob) => {
          if (this.viewingDocument()?.id !== doc.id) return;
          // Si el API devolvió JSON de error como blob, no abrir el visor.
          if (blob.type && blob.type.includes('application/json')) {
            this.viewerError.set(
              this._transloco.translate('processDetail.actions.documentsModal.viewerError')
            );
            return;
          }
          const pdfBlob =
            blob.type === 'application/pdf' || !blob.type
              ? blob
              : new Blob([blob], { type: 'application/pdf' });
          this._viewerObjectUrl = URL.createObjectURL(pdfBlob);
          this.viewerUrl.set(this._sanitizer.bypassSecurityTrustResourceUrl(this._viewerObjectUrl));
        },
        error: () => {
          if (this.viewingDocument()?.id !== doc.id) return;
          this.viewerError.set(
            this._transloco.translate('processDetail.actions.documentsModal.viewerError')
          );
        },
      });
  }

  public closeViewer(): void {
    this._closeViewer();
  }

  /** Encola PDFs (click o drag-and-drop de varios a la vez). */
  public enqueueFiles(files: File[]): void {
    this.errorMessage.set(null);
    this.fieldErrors.set({});
    if (!files.length) return;

    const errors: string[] = [];
    const accepted: File[] = [];
    const current = this.selectedFiles();

    for (const file of files) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        errors.push(
          this._transloco.translate('processDetail.actions.documentsModal.invalidType', {
            name: file.name,
          })
        );
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(
          this._transloco.translate('processDetail.actions.documentsModal.tooLarge', {
            name: file.name,
          })
        );
        continue;
      }
      accepted.push(file);
    }

    const merged = [...current, ...accepted].slice(0, MAX_FILES);
    if (current.length + accepted.length > MAX_FILES) {
      errors.push(
        this._transloco.translate('processDetail.actions.documentsModal.maxFiles', {
          max: MAX_FILES,
        })
      );
    }

    this.selectedFiles.set(merged);
    if (errors.length) {
      this.errorMessage.set(errors[0]);
    }
  }

  public onDropZoneError(messageKey: string | null): void {
    if (!messageKey) return;
    this.errorMessage.set(this._transloco.translate(messageKey));
  }

  public removeSelectedFile(index: number): void {
    this.selectedFiles.update((list) => list.filter((_, i) => i !== index));
  }

  public toggleOrg(orgId: string): void {
    this._defaultOrgSelectionApplied = true;
    this.selectedOrgIds.update((set) => {
      const next = new Set(set);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  public isOrgSelected(orgId: string): boolean {
    return this.selectedOrgIds().has(orgId);
  }

  public selectAllOrgs(): void {
    this._defaultOrgSelectionApplied = true;
    this.selectedOrgIds.set(new Set(this.organizations().map((o) => o.id)));
  }

  public clearOrgSelection(): void {
    this._defaultOrgSelectionApplied = true;
    this.selectedOrgIds.set(new Set());
  }

  public orgName(orgId: string): string {
    return this.organizations().find((o) => o.id === orgId)?.name ?? orgId;
  }

  public canViewFlag(orgId: string): boolean | null {
    const map = this.orgCanView();
    if (orgId in map) return map[orgId];
    const fromList = this.organizations().find((o) => o.id === orgId)?.can_view_action_documents;
    if (typeof fromList === 'boolean') return fromList;
    return null;
  }

  public formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '–';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  public onUpload(): void {
    if (this.uploading() || this.confirmUploadOpen()) return;

    if (!this.canUpload()) {
      if (!this.selectedFiles().length) {
        this.errorMessage.set(this._transloco.translate('processDetail.actions.documentsModal.noFiles'));
      } else if (!this.selectedOrgIds().size) {
        this.errorMessage.set(this._transloco.translate('processDetail.actions.documentsModal.noOrgs'));
      }
      return;
    }

    this.errorMessage.set(null);
    this.confirmUploadOpen.set(true);
  }

  public onCancelConfirmUpload(): void {
    if (this.uploading()) return;
    this.confirmUploadOpen.set(false);
  }

  public onConfirmUpload(): void {
    if (this.uploading() || !this.canUpload()) {
      this.confirmUploadOpen.set(false);
      return;
    }

    const files = this.selectedFiles();
    const orgIds = Array.from(this.selectedOrgIds());

    this.confirmUploadOpen.set(false);
    this.uploading.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    this._processService
      .uploadActionDocuments(this.processId(), this.action().id, files, orgIds)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (response) => {
          const uploaded = response.documents ?? [];
          const enabledOrganizationIds = this._markSelectedOrgsCanView(orgIds);
          this.documents.update((list) => [...list, ...uploaded]);
          this.selectedFiles.set([]);
          this._defaultOrgSelectionApplied = false;
          this._applyDefaultOrgSelection();
          this.changed.emit({
            type: 'uploaded',
            documents: uploaded,
            enabledOrganizationIds,
          });
        },
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  public startEditAcl(doc: ActionDocument): void {
    this.confirmDeleteId.set(null);
    this.editingAclId.set(doc.id);
    this.editingAclOrgIds.set(new Set(doc.organization_ids ?? []));
    this.errorMessage.set(null);
  }

  public cancelEditAcl(): void {
    this.editingAclId.set(null);
    this.editingAclOrgIds.set(new Set());
  }

  public toggleAclOrg(orgId: string): void {
    this.editingAclOrgIds.update((set) => {
      const next = new Set(set);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  public isAclOrgSelected(orgId: string): boolean {
    return this.editingAclOrgIds().has(orgId);
  }

  public saveAcl(doc: ActionDocument): void {
    const orgIds = Array.from(this.editingAclOrgIds());
    if (!orgIds.length) {
      this.errorMessage.set(this._transloco.translate('processDetail.actions.documentsModal.noOrgs'));
      return;
    }

    this.savingAclId.set(doc.id);
    this.errorMessage.set(null);

    this._processService
      .updateMediaOrganizations(doc.id, { organization_ids: orgIds })
      .pipe(finalize(() => this.savingAclId.set(null)))
      .subscribe({
        next: (response) => {
          const updated = response.document;
          const enabledOrganizationIds = this._markSelectedOrgsCanView(orgIds);
          this.documents.update((list) =>
            list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
          );
          this.cancelEditAcl();
          this.changed.emit({
            type: 'updated',
            document: updated,
            enabledOrganizationIds,
          });
        },
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  public askDelete(doc: ActionDocument): void {
    this.cancelEditAcl();
    this.confirmDeleteId.set(doc.id);
  }

  public cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  public confirmDelete(doc: ActionDocument): void {
    this.deletingId.set(doc.id);
    this.errorMessage.set(null);

    this._processService
      .deleteMedia(doc.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.documents.update((list) => list.filter((item) => item.id !== doc.id));
          this.confirmDeleteId.set(null);
          this.changed.emit({ type: 'deleted', mediaId: doc.id });
        },
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  /**
   * Tras guardar: las orgs marcadas quedan con acceso a estos PDF y el backend
   * enciende `can_view_action_documents` si estaba apagado. Refrescamos badges.
   * Desmarcar no apaga el setting global (solo sale del ACL de este documento).
   */
  private _markSelectedOrgsCanView(orgIds: string[]): string[] {
    if (!orgIds.length) return [];
    this.orgCanView.update((map) => {
      const next = { ...map };
      for (const id of orgIds) {
        next[id] = true;
      }
      return next;
    });
    return [...orgIds];
  }

  /** Pre-selecciona orgs con `can_view_action_documents === true`. */
  private _applyDefaultOrgSelection(): void {
    if (this._defaultOrgSelectionApplied || this.loadingOrgFlags()) return;

    const orgs = this.organizations();
    if (!orgs.length) return;

    const selected = new Set<string>();
    for (const org of orgs) {
      if (this.canViewFlag(org.id) === true) {
        selected.add(org.id);
      }
    }
    this.selectedOrgIds.set(selected);
    this._defaultOrgSelectionApplied = true;
  }

  private _loadOrgViewFlags(orgs: ProcessInterestedOrganization[]): void {
    if (!orgs.length) {
      this.orgCanView.set({});
      this.loadingOrgFlags.set(false);
      this.selectedOrgIds.set(new Set());
      this._defaultOrgSelectionApplied = true;
      return;
    }

    const known: Record<string, boolean | null> = {};
    const missing: ProcessInterestedOrganization[] = [];

    for (const org of orgs) {
      // Preferir mapa local (p. ej. recién habilitada tras un save) sobre el input del padre.
      const local = this.orgCanView()[org.id];
      if (typeof local === 'boolean') {
        known[org.id] = local;
      } else if (typeof org.can_view_action_documents === 'boolean') {
        known[org.id] = org.can_view_action_documents;
      } else {
        missing.push(org);
      }
    }

    if (!missing.length) {
      this.orgCanView.set({ ...this.orgCanView(), ...known });
      this.loadingOrgFlags.set(false);
      this._applyDefaultOrgSelection();
      return;
    }

    this.loadingOrgFlags.set(true);
    forkJoin(
      missing.map((org) =>
        this._organizationService.getOrganizationSettings(org.id).pipe(
          map((settings) => ({ id: org.id, value: !!settings.can_view_action_documents })),
          catchError(() => of({ id: org.id, value: null as boolean | null }))
        )
      )
    )
      .pipe(finalize(() => this.loadingOrgFlags.set(false)))
      .subscribe((results) => {
        const next = { ...this.orgCanView(), ...known };
        for (const row of results) {
          if (next[row.id] === true) continue; // no pisar habilitaciones locales
          next[row.id] = row.value;
        }
        this.orgCanView.set(next);
        this._applyDefaultOrgSelection();
      });
  }

  private _closeViewer(): void {
    const wasOpen = !!this.viewingDocument();
    this._revokeViewerUrl();
    this.viewingDocument.set(null);
    this.viewerUrl.set(null);
    this.viewerError.set(null);
    this.viewerLoading.set(false);
    if (wasOpen) {
      this.viewerOpenChange.emit(false);
    }
  }

  private _revokeViewerUrl(): void {
    if (this._viewerObjectUrl) {
      URL.revokeObjectURL(this._viewerObjectUrl);
      this._viewerObjectUrl = null;
    }
  }

  private _handleError(err: HttpErrorResponse): void {
    const fieldErrors = this._extractFieldErrors(err);
    if (Object.keys(fieldErrors).length) {
      this.fieldErrors.set(fieldErrors);
    }

    const message =
      typeof err.error?.message === 'string' && err.error.message.trim()
        ? err.error.message
        : err.status === 404
          ? this._transloco.translate('processDetail.actions.documentsModal.notFound')
          : this._transloco.translate('processDetail.actions.documentsModal.errorGeneric');

    this.errorMessage.set(message);
  }

  private _extractFieldErrors(err: HttpErrorResponse): Record<string, string> {
    const errors = err.error?.errors;
    if (!errors || typeof errors !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length) {
        result[key] = String(value[0]);
      } else if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }
}
