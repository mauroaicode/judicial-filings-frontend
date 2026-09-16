import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, startWith, switchMap, tap } from 'rxjs/operators';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import { ProcessService } from '@app/core/services/process/process.service';
import { Organization } from '@app/core/models/organization/organization.model';
import { ProcessOrganizationsMutationResponse } from '@app/core/models/process/process.model';

export interface SelectableOrganization {
  id: string;
  name: string;
}

@Component({
  selector: 'app-add-process-organizations-modal',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './add-process-organizations-modal.component.html',
  styleUrls: ['./add-process-organizations-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddProcessOrganizationsModalComponent {
  private _organizationService = inject(OrganizationService);
  private _processService = inject(ProcessService);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);
  private _search$ = new Subject<string>();

  public processId = input.required<string>();
  /** IDs already linked to the process — excluded from the dropdown */
  public excludeIds = input<string[]>([]);

  public closed = output<void>();
  public saved = output<ProcessOrganizationsMutationResponse>();

  public query = signal('');
  public results = signal<SelectableOrganization[]>([]);
  public selected = signal<SelectableOrganization[]>([]);
  public isSearching = signal(false);
  public isSaving = signal(false);
  public errorMessage = signal<string | null>(null);
  public fieldError = signal<string | null>(null);

  public selectedIds = computed(() => new Set(this.selected().map((item) => item.id)));

  constructor() {
    this._search$
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => {
          this.isSearching.set(true);
          this.errorMessage.set(null);
        }),
        switchMap((name) =>
          this._organizationService
            .getOrganizations({
              name: name.trim() || undefined,
              is_active: 'active',
              per_page: 20,
              page: 1,
            })
            .pipe(catchError(() => of({ data: [] as Organization[] })))
        ),
        takeUntilDestroyed(this._destroyRef)
      )
      .subscribe((response) => {
        const excluded = new Set(this.excludeIds());
        const items = (response.data ?? [])
          .filter((org) => org.is_active !== false)
          .filter((org) => !excluded.has(org.id))
          .map((org) => ({ id: org.id, name: org.name }));
        this.results.set(items);
        this.isSearching.set(false);
      });
  }

  public onQueryInput(value: string): void {
    this.query.set(value);
    this._search$.next(value.trim());
  }

  public isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  public toggleOrganization(org: SelectableOrganization): void {
    if (this.isSaving()) return;
    if (this.isSelected(org.id)) {
      this.selected.update((list) => list.filter((item) => item.id !== org.id));
      return;
    }
    this.selected.update((list) => [...list, org]);
    this.fieldError.set(null);
  }

  public removeSelected(id: string): void {
    if (this.isSaving()) return;
    this.selected.update((list) => list.filter((item) => item.id !== id));
  }

  public onClose(): void {
    if (this.isSaving()) return;
    this.closed.emit();
  }

  public onSave(): void {
    const ids = this.selected().map((item) => item.id);
    if (!ids.length || this.isSaving()) {
      this.fieldError.set(this._transloco.translate('processDetail.organizations.addModal.minOne'));
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.fieldError.set(null);

    this._processService
      .attachProcessOrganizations(this.processId(), { organization_ids: ids })
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => this.saved.emit(response),
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  private _handleError(err: HttpErrorResponse): void {
    const field = this._extractFieldError(err);
    if (field) {
      this.fieldError.set(field);
    }

    const message =
      typeof err.error?.message === 'string' && err.error.message.trim()
        ? err.error.message
        : err.status === 404
          ? this._transloco.translate('processDetail.organizations.addModal.notFound')
          : this._transloco.translate('processDetail.organizations.addModal.errorGeneric');

    if (!field || err.status === 404) {
      this.errorMessage.set(message);
    }
  }

  private _extractFieldError(err: HttpErrorResponse): string | null {
    const errors = err.error?.errors;
    if (!errors || typeof errors !== 'object') return null;
    const messages: string[] = [];
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (!key.startsWith('organization_ids')) continue;
      if (Array.isArray(value)) {
        messages.push(...value.map((item) => String(item)));
      } else if (typeof value === 'string') {
        messages.push(value);
      }
    }
    if (!messages.length) {
      for (const value of Object.values(errors as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length) {
          messages.push(String(value[0]));
        } else if (typeof value === 'string') {
          messages.push(value);
        }
      }
    }
    return messages.length ? messages.join(' ') : null;
  }
}
