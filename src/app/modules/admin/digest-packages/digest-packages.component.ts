import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DigestPackageService } from '@app/core/services/digest-package/digest-package.service';
import {
  DigestPackageDiscardResult,
  DigestPackageOrganization,
  DigestPackagePreview,
  DigestPackageSendResult,
} from '@app/core/models/digest-package/digest-package.model';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogDetailRow,
} from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { PendingDigestDetailComponent } from './pages/pending-digest-detail/pending-digest-detail.component';

@Component({
  selector: 'app-digest-packages',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoPipe,
    ConfirmationDialogComponent,
    PendingDigestDetailComponent,
  ],
  templateUrl: './digest-packages.component.html',
  styleUrls: ['./digest-packages.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DigestPackagesComponent implements OnInit {
  private _service = inject(DigestPackageService);
  private _transloco = inject(TranslocoService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _destroyRef = inject(DestroyRef);

  public preview = signal<DigestPackagePreview | null>(null);
  public loading = signal<boolean>(true);
  public loadError = signal<boolean>(false);
  public sending = signal<boolean>(false);
  public discarding = signal<boolean>(false);
  public confirmOpen = signal<boolean>(false);
  public discardConfirmOpen = signal<boolean>(false);
  public discardTarget = signal<DigestPackageOrganization | null>(null);

  /** Org del consolidado pendiente abierto en modal (deep link: ?organization=). */
  public detailOrganizationId = signal<string | null>(null);

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

    this._route.queryParamMap.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((q) => {
      const orgId = q.get('organization')?.trim() || null;
      this.detailOrganizationId.set(orgId);
    });
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

  openDiscardConfirm(org: DigestPackageOrganization): void {
    this.discardTarget.set(org);
    this.discardConfirmOpen.set(true);
  }

  cancelDiscardConfirm(): void {
    this.discardConfirmOpen.set(false);
    this.discardTarget.set(null);
  }

  onConfirmDiscard(): void {
    const org = this.discardTarget();
    if (!org) return;

    this.discardConfirmOpen.set(false);
    this.discarding.set(true);
    this._service.discardOrganization(org.organization_id).subscribe({
      next: (result: DigestPackageDiscardResult) => {
        this.discarding.set(false);
        this.discardTarget.set(null);
        this._showToast(result.message, 'success');
        this.loadPreview();
      },
      error: (err) => {
        this.discarding.set(false);
        this.discardTarget.set(null);
        const msg =
          err?.error?.message ||
          this._transloco.translate('digestPackages.errors.discardGeneric');
        this._showToast(msg, 'error');
      },
    });
  }

  /** Abre el detalle en modal y deja la URL compartible. */
  openOrgDetail(org: DigestPackageOrganization): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        organization: org.organization_id,
        page: null,
        per_page: null,
      },
      queryParamsHandling: 'merge',
    });
  }

  /** Cierra la modal y limpia query params de detalle. */
  closeOrgDetail(): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        organization: null,
        page: null,
        per_page: null,
      },
      queryParamsHandling: 'merge',
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
