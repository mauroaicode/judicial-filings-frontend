import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  OrganizationDetail,
  UpdateOrganizationSettingsResponse,
} from '@app/core/models/organization/organization.model';

export type OrganizationSettingsTab = 'info' | 'settings';

@Component({
  selector: 'app-organization-settings-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './organization-settings-modal.component.html',
  styleUrls: ['./organization-settings-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSettingsModalComponent implements OnInit {
  private _organizationService = inject(OrganizationService);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);

  public organizationId = input.required<string>();

  public closed = output<void>();
  public saved = output<UpdateOrganizationSettingsResponse>();

  public activeTab = signal<OrganizationSettingsTab>('info');
  public loading = signal(true);
  public saving = signal(false);
  public detail = signal<OrganizationDetail | null>(null);
  public loadError = signal<string | null>(null);
  public saveError = signal<string | null>(null);

  public settingsForm: FormGroup = this._fb.group({
    useDefault: [true],
    max_active_processes: [{ value: null as number | null, disabled: true }, [Validators.min(0)]],
  });

  ngOnInit(): void {
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    this.detail.set(null);

    this._organizationService.getOrganization(this.organizationId()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this._patchForm(detail);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(this._parseApiError(err, 'clients.settings.loadError'));
      },
    });
  }

  setTab(tab: OrganizationSettingsTab): void {
    this.activeTab.set(tab);
  }

  onUseDefaultChange(checked: boolean): void {
    const control = this.settingsForm.get('max_active_processes');
    if (!control) return;

    if (checked) {
      control.disable({ emitEvent: false });
      const defaultLimit = this.detail()?.settings.default_max_active_processes ?? null;
      control.setValue(defaultLimit, { emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
      if (control.value === null || control.value === undefined || control.value === '') {
        const fallback = this.detail()?.settings.default_max_active_processes ?? 0;
        control.setValue(fallback, { emitEvent: false });
      }
    }
  }

  onClose(): void {
    if (this.saving()) return;
    this.closed.emit();
  }

  onSave(): void {
    if (this.saving() || this.loading() || !this.detail()) return;

    this.saveError.set(null);
    const useDefault = !!this.settingsForm.get('useDefault')?.value;
    const raw = this.settingsForm.getRawValue().max_active_processes;

    let maxActiveProcesses: number | null = null;
    if (!useDefault) {
      const parsed = this._parseNonNegativeInteger(raw);
      if (parsed === null) {
        this.saveError.set(this._transloco.translate('clients.settings.invalidLimit'));
        this.settingsForm.get('max_active_processes')?.markAsTouched();
        this.activeTab.set('settings');
        return;
      }
      maxActiveProcesses = parsed;
    }

    this.saving.set(true);
    this._organizationService
      .updateOrganizationSettings(this.organizationId(), {
        max_active_processes: maxActiveProcesses,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          this.saved.emit(response);
        },
        error: (err) => {
          this.saveError.set(this._parseApiError(err, 'clients.settings.saveError'));
          this.activeTab.set('settings');
        },
      });
  }

  formatLimit(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return this._transloco.translate('clients.settings.unlimited');
    }
    return String(value);
  }

  remainingSlotsLabel(): string {
    const remaining = this.detail()?.settings.remaining_slots;
    if (remaining === null || remaining === undefined) {
      return this._transloco.translate('clients.settings.unlimited');
    }
    return String(remaining);
  }

  defaultHintValue(): string {
    return this.formatLimit(this.detail()?.settings.default_max_active_processes);
  }

  private _patchForm(detail: OrganizationDetail): void {
    const configured = detail.settings.max_active_processes_configured;
    const useDefault = configured === null || configured === undefined;
    const inputValue = configured ?? detail.settings.default_max_active_processes ?? null;

    this.settingsForm.patchValue(
      {
        useDefault,
        max_active_processes: inputValue,
      },
      { emitEvent: false }
    );

    const control = this.settingsForm.get('max_active_processes');
    if (useDefault) {
      control?.disable({ emitEvent: false });
    } else {
      control?.enable({ emitEvent: false });
    }
  }

  private _parseNonNegativeInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
      return null;
    }
    return numeric;
  }

  private _parseApiError(err: { status?: number; error?: unknown }, fallbackKey: string): string {
    const body = err?.error;
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }

      const messages = (body as { messages?: unknown }).messages;
      if (Array.isArray(messages) && typeof messages[0] === 'string' && messages[0].trim()) {
        return messages[0].trim();
      }

      const errors = (body as { errors?: Record<string, string[]> }).errors;
      if (errors && typeof errors === 'object') {
        for (const key of Object.keys(errors)) {
          const arr = errors[key];
          if (Array.isArray(arr) && typeof arr[0] === 'string' && arr[0].trim()) {
            return arr[0].trim();
          }
        }
      }
    }

    return this._transloco.translate(fallbackKey);
  }
}
