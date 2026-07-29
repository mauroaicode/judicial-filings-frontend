import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DigestPackageService } from '@app/core/services/digest-package/digest-package.service';
import {
  DigestPackageOrganization,
  DigestPackagePreview,
  DigestPackageSendResult,
} from '@app/core/models/digest-package/digest-package.model';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-digest-packages',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ConfirmationDialogComponent],
  templateUrl: './digest-packages.component.html',
  styleUrls: ['./digest-packages.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DigestPackagesComponent implements OnInit {
  private _service = inject(DigestPackageService);
  private _transloco = inject(TranslocoService);

  public preview = signal<DigestPackagePreview | null>(null);
  public loading = signal<boolean>(true);
  public loadError = signal<boolean>(false);
  public sending = signal<boolean>(false);
  public confirmOpen = signal<boolean>(false);

  public toastMessage = signal<string | null>(null);
  public toastKind = signal<'success' | 'error'>('success');
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  public isEmpty = computed(() => {
    const p = this.preview();
    return !p || p.consolidates_ready === 0;
  });

  public confirmDetailRows = computed<ConfirmationDialogDetailRow[]>(() => {
    const p = this.preview();
    if (!p) return [];
    return [
      {
        label: this._transloco.translate('digestPackages.confirmRowConsolidates'),
        value: String(p.consolidates_ready),
      },
      {
        label: this._transloco.translate('digestPackages.confirmRowProcesses'),
        value: String(p.total_pending_processes),
      },
      {
        label: this._transloco.translate('digestPackages.confirmRowActions'),
        value: String(p.total_pending_actions),
      },
    ];
  });

  ngOnInit(): void {
    this.loadPreview();
  }

  loadPreview(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this._service.preview().subscribe({
      next: (data) => {
        this.preview.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  openConfirm(): void {
    this.confirmOpen.set(true);
  }

  cancelConfirm(): void {
    this.confirmOpen.set(false);
  }

  onConfirmSend(): void {
    this.confirmOpen.set(false);
    this.sending.set(true);
    this._service.send().subscribe({
      next: (result: DigestPackageSendResult) => {
        this.sending.set(false);
        this._showToast(result.message, 'success');
        this.loadPreview();
      },
      error: (err) => {
        this.sending.set(false);
        const msg =
          err?.error?.message ||
          this._transloco.translate('digestPackages.errors.sendGeneric');
        this._showToast(msg, 'error');
      },
    });
  }

  /** Formatea la lista de canales de una org en una sola cadena legible */
  formatChannels(org: DigestPackageOrganization): string {
    const channels = org.channels ?? {};
    const parts = Object.entries(channels)
      .filter(([, values]) => values && values.length > 0)
      .map(([type, values]) => `${type}: ${values.join(', ')}`);
    return parts.join(' · ') || '—';
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
    }, 3400);
  }
}
