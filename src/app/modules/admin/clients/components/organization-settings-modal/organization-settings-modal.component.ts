import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, of } from 'rxjs';
import { finalize, map, switchMap } from 'rxjs/operators';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import {
  NotificationChannelType,
  OrganizationDetail,
  OrganizationNotificationChannelLimits,
  OrganizationStatusMode,
  UpdateOrganizationNotificationChannelLimitsPayload,
  UpdateOrganizationSettingsPayload,
  UpdateOrganizationSettingsResponse,
} from '@app/core/models/organization/organization.model';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

export type OrganizationSettingsTab = 'info' | 'settings';

@Component({
  selector: 'app-organization-settings-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ConfirmationDialogComponent],
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

  readonly organizationTypeLabel = computed(() => {
    const org = this.detail();
    if (!org) return '';
    const fromApi = org.type_label?.trim();
    if (fromApi) return fromApi;
    const normalized = (org.type ?? '').trim().toLowerCase();
    if (normalized === 'natural') return this._transloco.translate('clients.kpi.natural');
    if (normalized === 'juridical') return this._transloco.translate('clients.kpi.juridical');
    return org.type?.trim() ?? '';
  });

  public activeTab = signal<OrganizationSettingsTab>('info');
  public loading = signal(true);
  public saving = signal(false);
  public detail = signal<OrganizationDetail | null>(null);
  public loadError = signal<string | null>(null);
  public saveError = signal<string | null>(null);
  public confirmSaveOpen = signal(false);
  public confirmDetailRows = signal<ConfirmationDialogDetailRow[]>([]);
  public channelLimits = signal<OrganizationNotificationChannelLimits | null>(null);
  readonly notificationChannelTypes: NotificationChannelType[] = ['email', 'whatsapp', 'sms'];
  private _pendingPayload: UpdateOrganizationSettingsPayload | null = null;
  private _pendingChannelLimits: UpdateOrganizationNotificationChannelLimitsPayload | null = null;

  public settingsForm: FormGroup = this._fb.group({
    useDefault: [true],
    max_active_processes: [{ value: null as number | null, disabled: true }, [Validators.min(0)]],
    can_view_action_documents: [false],
    email_use_default: [true],
    email_max: [{ value: null as number | null, disabled: true }, [Validators.min(0), Validators.max(100)]],
    whatsapp_use_default: [true],
    whatsapp_max: [{ value: null as number | null, disabled: true }, [Validators.min(0), Validators.max(100)]],
    sms_use_default: [true],
    sms_max: [{ value: null as number | null, disabled: true }, [Validators.min(0), Validators.max(100)]],
  });

  ngOnInit(): void {
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    this.detail.set(null);
    this.channelLimits.set(null);

    forkJoin({
      detail: this._organizationService.getOrganization(this.organizationId()),
      limits: this._organizationService.getNotificationChannelLimits(this.organizationId()),
    }).subscribe({
      next: ({ detail, limits }) => {
        this.detail.set(detail);
        this.channelLimits.set(limits);
        this._patchForm(detail);
        this._patchChannelLimits(limits);
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
    if (this.saving() || this.confirmSaveOpen()) return;
    this.closed.emit();
  }

  onSave(): void {
    if (this.saving() || this.loading() || !this.detail() || this.confirmSaveOpen()) return;

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

    const canViewActionDocuments = !!this.settingsForm.get('can_view_action_documents')?.value;
    const channelLimits = this._readChannelLimits();
    if (!channelLimits) {
      this.activeTab.set('settings');
      return;
    }

    this._pendingPayload = {
      max_active_processes: maxActiveProcesses,
      can_view_action_documents: canViewActionDocuments,
    };
    this._pendingChannelLimits = channelLimits;

    this.confirmDetailRows.set([
      {
        label: this._transloco.translate('clients.settings.limitInputLabel'),
        value: useDefault
          ? this._transloco.translate('clients.settings.usingDefault', {
              value: this.defaultHintValue(),
            })
          : this.formatLimit(maxActiveProcesses),
      },
      {
        label: this._transloco.translate('clients.settings.canViewActionDocuments'),
        value: canViewActionDocuments
          ? this._transloco.translate('clients.settings.confirmYes')
          : this._transloco.translate('clients.settings.confirmNo'),
      },
      ...this.notificationChannelTypes.map((type) => ({
        label: this.channelTitle(type),
        value:
          channelLimits[type] === null
            ? this._transloco.translate('clients.settings.channelUseDefault', {
                value: this.channelLimits()?.default_limit ?? 3,
              })
            : String(channelLimits[type]),
      })),
    ]);
    this.confirmSaveOpen.set(true);
  }

  onCancelConfirmSave(): void {
    if (this.saving()) return;
    this.confirmSaveOpen.set(false);
    this._pendingPayload = null;
    this._pendingChannelLimits = null;
  }

  onConfirmSave(): void {
    if (this.saving() || !this._pendingPayload) {
      this.confirmSaveOpen.set(false);
      return;
    }

    const payload = this._pendingPayload;
    const channelLimits = this._pendingChannelLimits;
    this.confirmSaveOpen.set(false);
    this.saving.set(true);

    this._organizationService
      .updateOrganizationSettings(this.organizationId(), payload)
      .pipe(
        switchMap((response) =>
          channelLimits
            ? this._organizationService
                .updateNotificationChannelLimits(this.organizationId(), channelLimits)
                .pipe(map(() => response))
            : of(response)
        ),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          this._pendingPayload = null;
          this._pendingChannelLimits = null;
          this.saved.emit(response);
        },
        error: (err) => {
          this.saveError.set(this._parseApiError(err, 'clients.settings.saveError'));
          this.activeTab.set('settings');
        },
      });
  }

  getStatusMode(
    org: Pick<OrganizationDetail, 'status_mode' | 'is_active' | 'is_process_tracking_enabled'>
  ): OrganizationStatusMode {
    if (org.status_mode === 'active' || org.status_mode === 'inactive' || org.status_mode === 'tracking_paused') {
      return org.status_mode;
    }
    if (!org.is_active) return 'inactive';
    if (org.is_process_tracking_enabled === false) return 'tracking_paused';
    return 'active';
  }

  getStatusBadgeLabelKey(org: OrganizationDetail): string {
    switch (this.getStatusMode(org)) {
      case 'tracking_paused':
        return 'clients.table.statusTrackingPaused';
      case 'inactive':
        return 'clients.table.statusInactive';
      default:
        return 'clients.table.statusActive';
    }
  }

  getStatusBadgeClass(org: OrganizationDetail): Record<string, boolean> {
    const mode = this.getStatusMode(org);
    return {
      'badge-success': mode === 'active',
      'badge-warning': mode === 'tracking_paused',
      'badge-neutral': mode === 'inactive',
    };
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

  channelTitle(type: NotificationChannelType): string {
    const key =
      type === 'email'
        ? 'clients.settings.channelEmail'
        : type === 'whatsapp'
          ? 'clients.settings.channelWhatsapp'
          : 'clients.settings.channelSms';
    return this._transloco.translate(key);
  }

  channelLimitFor(type: NotificationChannelType) {
    return this.channelLimits()?.channels.find((channel) => channel.channel_type === type);
  }

  onChannelDefaultChange(type: NotificationChannelType, checked: boolean): void {
    const control = this.settingsForm.get(`${type}_max`);
    if (!control) return;

    if (checked) {
      control.disable({ emitEvent: false });
      control.setValue(this.channelLimits()?.default_limit ?? 3, { emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
      if (control.value === null || control.value === undefined || control.value === '') {
        control.setValue(this.channelLimits()?.default_limit ?? 3, { emitEvent: false });
      }
    }
  }

  private _patchChannelLimits(limits: OrganizationNotificationChannelLimits): void {
    for (const channel of limits.channels) {
      const useDefault = channel.configured_limit === null || channel.configured_limit === undefined;
      this.settingsForm.get(`${channel.channel_type}_use_default`)?.setValue(useDefault, { emitEvent: false });
      const control = this.settingsForm.get(`${channel.channel_type}_max`);
      control?.setValue(channel.configured_limit ?? channel.default_limit, { emitEvent: false });
      if (useDefault) {
        control?.disable({ emitEvent: false });
      } else {
        control?.enable({ emitEvent: false });
      }
    }
  }

  private _readChannelLimits(): UpdateOrganizationNotificationChannelLimitsPayload | null {
    const payload: UpdateOrganizationNotificationChannelLimitsPayload = {};

    for (const type of this.notificationChannelTypes) {
      const useDefault = !!this.settingsForm.get(`${type}_use_default`)?.value;
      if (useDefault) {
        payload[type] = null;
        continue;
      }

      const parsed = this._parseNonNegativeInteger(this.settingsForm.getRawValue()[`${type}_max`]);
      if (parsed === null || parsed > 100) {
        this.saveError.set(this._transloco.translate('clients.settings.channelInvalid'));
        this.settingsForm.get(`${type}_max`)?.markAsTouched();
        return null;
      }

      payload[type] = parsed;
    }

    return payload;
  }

  private _patchForm(detail: OrganizationDetail): void {
    const configured = detail.settings.max_active_processes_configured;
    const useDefault = configured === null || configured === undefined;
    const inputValue = configured ?? detail.settings.default_max_active_processes ?? null;

    this.settingsForm.patchValue(
      {
        useDefault,
        max_active_processes: inputValue,
        can_view_action_documents: !!detail.settings.can_view_action_documents,
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
