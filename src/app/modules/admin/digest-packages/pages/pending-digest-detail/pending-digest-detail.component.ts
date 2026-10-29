import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  NotificationDigestService,
  saveDigestPdfFile,
} from '@app/core/services/notification-digest/notification-digest.service';
import {
  NotificationDigestDetail,
  NotificationDigestDetailItem,
  NotificationDigestDetailResponse,
  NotificationDigestDisplayRow,
  NotificationDigestFilter,
} from '@app/core/models/notification-digest/notification-digest.model';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';
import { ProcessAlertTooltipComponent } from '@app/shared/components/process-alert-tooltip/process-alert-tooltip.component';

@Component({
  selector: 'app-pending-digest-detail',
  standalone: true,
  imports: [
    CommonModule,
    NgTemplateOutlet,
    TranslocoPipe,
    ProcessNumberPipe,
    ProcessAlertTooltipComponent,
  ],
  templateUrl: './pending-digest-detail.component.html',
  styleUrls: ['./pending-digest-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingDigestDetailComponent {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _service = inject(NotificationDigestService);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  /** Organización cuyo consolidado se muestra. Null = modal cerrada. */
  public organizationId = input<string | null>(null);
  /** Consolidado ya persistido. Sin este id se consulta el pendiente. */
  public digestId = input<string | null>(null);
  /** Filtros del detalle persistido. No aplica al pendiente. */
  public filters = input<NotificationDigestFilter | null>(null);
  public closed = output<void>();

  public readonly pageSizeOptions = [10, 20, 25, 50, 100] as const;
  public readonly defaultPerPage = 20;

  public digest = signal<NotificationDigestDetail | null>(null);
  public rows = signal<NotificationDigestDisplayRow[]>([]);
  public loading = signal(false);
  public loadError = signal(false);
  public loadErrorMessage = signal<string | null>(null);

  public currentPage = signal(1);
  public currentPerPage = signal(this.defaultPerPage);
  public pagination = signal<{
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    per_page: number;
  } | null>(null);

  public hoveredRowId = signal<string | null>(null);
  public showActionDetailModal = signal(false);
  public selectedActionDetail = signal<NotificationDigestDisplayRow | null>(null);
  public copiedMessage = signal<string | null>(null);
  public downloadingPdfId = signal<string | null>(null);
  public pdfToast = signal<string | null>(null);
  public mobileSummaryExpanded = signal(false);
  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private _pdfToastTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadedOrgId: string | null = null;
  private _loadedDigestKey: string | null = null;
  private _request = 0;

  public isOpen = computed(() => !!this.organizationId());

  public uniqueProcessesCount = computed(() => {
    const set = new Set(
      this.rows()
        .map((r) => r.process_number)
        .filter((n) => !!n),
    );
    return set.size;
  });

  constructor() {
    effect(() => {
      const orgId = this.organizationId();
      const digestId = this.digestId()?.trim() || null;
      const filters = this.filters();
      if (!orgId) {
        this._resetState();
        this._loadedOrgId = null;
        this._loadedDigestKey = null;
        return;
      }

      if (digestId) {
        const q = this._route.snapshot.queryParamMap;
        const page = Math.max(1, parseInt(q.get('digest_page') || '1', 10) || 1);
        const perRaw = parseInt(q.get('digest_per_page') || String(this.defaultPerPage), 10);
        const perPage = this.normalizePerPage(Number.isFinite(perRaw) ? perRaw : this.defaultPerPage);
        const key = `${orgId}:${digestId}:${page}:${perPage}:${JSON.stringify(filters ?? {})}`;
        if (this._loadedDigestKey === key && this.digest()) return;
        this.load(orgId, page, perPage);
        return;
      }

      const q = this._route.snapshot.queryParamMap;
      const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
      const perRaw = parseInt(q.get('per_page') || String(this.defaultPerPage), 10);
      const perPage = this.normalizePerPage(
        Number.isFinite(perRaw) ? perRaw : this.defaultPerPage,
      );

      // Evita reload innecesario si ya cargamos la misma org con mismos params
      if (
        this._loadedOrgId === orgId &&
        this.currentPage() === page &&
        this.currentPerPage() === perPage &&
        this.digest()
      ) {
        return;
      }

      this.load(orgId, page, perPage);
    });
  }

  load(
    orgId: string = this.organizationId() ?? '',
    page: number = this.currentPage(),
    perPage: number = this.currentPerPage(),
  ): void {
    if (!orgId) {
      this.loadError.set(true);
      this.loading.set(false);
      return;
    }

    const digestId = this.digestId()?.trim() || '';
    const requestId = ++this._request;
    this.loading.set(true);
    this.loadError.set(false);
    this.loadErrorMessage.set(null);
    this.currentPage.set(page);
    this.currentPerPage.set(perPage);
    if (digestId) this.syncDigestQueryParams(orgId, digestId, page, perPage);
    else this.syncQueryParams(orgId, page, perPage);

    const request$ = digestId
      ? this._service.getById(orgId, digestId, page, perPage, this.filters() ?? undefined)
      : this._service.getPending(orgId, page, perPage);

    request$.subscribe({
      next: (response) => {
        if (requestId !== this._request) return;
        this.applyResponse(response);
        this._loadedOrgId = orgId;
        if (digestId) {
          this._loadedDigestKey = `${orgId}:${digestId}:${page}:${perPage}:${JSON.stringify(this.filters() ?? {})}`;
        }
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (requestId !== this._request) return;
        this.loadError.set(true);
        this.loading.set(false);
        this.digest.set(null);
        this.rows.set([]);
        this.pagination.set(null);
        this._loadedOrgId = orgId;
        if (digestId) {
          this._loadedDigestKey = `${orgId}:${digestId}:${page}:${perPage}:${JSON.stringify(this.filters() ?? {})}`;
          this.loadErrorMessage.set(
            this._transloco.translate(
              error.status === 404
                ? 'notificationDigests.detail.notFound'
                : 'notificationDigests.detail.loadFailed',
            ),
          );
        }
      },
    });
  }

  downloadPdf(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const digestId = this.digestId()?.trim() || '';
    const organizationId = this.organizationId()?.trim() || '';
    if (!digestId || !organizationId || this.downloadingPdfId()) return;

    this.downloadingPdfId.set(digestId);
    this._service
      .exportPdf(digestId, organizationId)
      .pipe(
        finalize(() => {
          if (this.downloadingPdfId() === digestId) this.downloadingPdfId.set(null);
        }),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (!saveDigestPdfFile(response, digestId)) this._showPdfError();
        },
        error: () => this._showPdfError(),
      });
  }

  close(): void {
    this.closeActionDetail();
    this.closed.emit();
  }

  private _showPdfError(): void {
    if (this._pdfToastTimer) clearTimeout(this._pdfToastTimer);
    this.pdfToast.set(this._transloco.translate('notificationDigests.pdf.error'));
    this._pdfToastTimer = setTimeout(() => {
      this.pdfToast.set(null);
      this._pdfToastTimer = null;
    }, 4000);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.isOpen()) return;
    event.preventDefault();
    if (this.showActionDetailModal()) {
      this.closeActionDetail();
      return;
    }
    this.close();
  }

  onPageChange(page: number, perPage: number): void {
    const orgId = this.organizationId();
    if (!orgId) return;
    this.load(orgId, Math.max(1, page), this.normalizePerPage(perPage));
  }

  getPageNumbers(): number[] {
    const p = this.pagination();
    if (!p) return [];
    const current = p.current_page;
    const last = p.last_page;
    const delta = 2;
    const start = Math.max(1, current - delta);
    const end = Math.min(last, current + delta);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  rowIndex(rowIndex: number): number {
    const p = this.pagination();
    if (!p) return rowIndex + 1;
    if (p.from != null && p.from > 0) return p.from + rowIndex;
    return (p.current_page - 1) * p.per_page + rowIndex + 1;
  }

  rowTrack(row: NotificationDigestDisplayRow, index: number): string {
    const main = row.process_action_id ?? `idx_${index}`;
    const rel = row.related_action?.process_action_id ?? '';
    return `${main}_${rel}`;
  }

  getPeriodClass(period: string): string {
    switch ((period || '').toLowerCase()) {
      case 'mañana':
        return 'manana';
      case 'tarde':
        return 'tarde';
      case 'noche':
        return 'noche';
      default:
        return 'manana';
    }
  }

  getPartyDisplay(parties: string[]): {
    mainText: string;
    extraCount: number;
    fullList: string[];
  } {
    if (!parties || parties.length === 0) {
      return { mainText: '', extraCount: 0, fullList: [] };
    }
    return {
      mainText: parties[0],
      extraCount: parties.length - 1,
      fullList: parties,
    };
  }

  getFijacionBadgeLabel(actionText: string | undefined): string {
    const t = (actionText ?? '').toLowerCase();
    if (t.includes('notificacion') || t.includes('notificación')) {
      return 'Notificación';
    }
    return 'Fijación';
  }

  actionLineText(item: NotificationDigestDetailItem): string {
    const t = item.action_text?.trim() || item.action?.trim();
    return t || '–';
  }

  linkedActionText(item: NotificationDigestDetailItem): string {
    return item.linked_action_text?.trim() || '–';
  }

  shouldShowMainAnnotation(item: NotificationDigestDetailItem): boolean {
    const a = item.annotation?.trim();
    if (!a) return false;
    return a !== '—' && a !== '---' && a !== '–';
  }

  formatMainAnnotation(item: NotificationDigestDetailItem): string {
    return (item.annotation ?? '').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  shouldShowLinkedAnnotation(item: NotificationDigestDetailItem): boolean {
    const a = item.linked_annotation?.trim();
    if (!a) return false;
    return a !== '—' && a !== '---' && a !== '–';
  }

  formatLinkedAnnotation(item: NotificationDigestDetailItem): string {
    return (item.linked_annotation ?? '').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  openActionDetail(action: NotificationDigestDisplayRow, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.selectedActionDetail.set(action);
    this.showActionDetailModal.set(true);
  }

  closeActionDetail(): void {
    this.showActionDetailModal.set(false);
    this.selectedActionDetail.set(null);
  }

  toggleMobileSummary(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.mobileSummaryExpanded.update((v) => !v);
  }

  copyToClipboard(text: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!text) return;
    const clean = text.replace(/[^0-9]/g, '') || text;
    navigator.clipboard.writeText(clean).then(() => {
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
      this.copiedMessage.set(this._transloco.translate('digestPackages.detail.copied'));
      this._copiedTimer = setTimeout(() => {
        this.copiedMessage.set(null);
        this._copiedTimer = null;
      }, 2000);
    });
  }

  goToProcess(processId: string | null | undefined, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!processId) return;
    void this._router.navigate(['/admin', 'processes', processId]);
  }

  private applyResponse(response: NotificationDigestDetailResponse): void {
    const wrapper =
      Array.isArray(response?.data) && response.data.length > 0 ? response.data[0] : null;

    this.digest.set(wrapper);
    this.rows.set(wrapper?.data ?? []);

    const lastPage =
      response.last_page ??
      Math.max(1, Math.ceil((response.total || 0) / (response.per_page || this.defaultPerPage)));

    this.pagination.set({
      current_page: response.current_page,
      last_page: lastPage,
      total: response.total,
      from: response.from,
      to: response.to,
      per_page: response.per_page,
    });
  }

  private syncDigestQueryParams(
    orgId: string,
    digestId: string,
    page: number,
    perPage: number,
  ): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        digest: digestId,
        digest_organization: orgId,
        digest_page: page > 1 ? String(page) : null,
        digest_per_page: perPage !== this.defaultPerPage ? String(perPage) : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private syncQueryParams(orgId: string, page: number, perPage: number): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        organization: orgId,
        page: page === 1 ? null : String(page),
        per_page: perPage === this.defaultPerPage ? null : String(perPage),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private normalizePerPage(value: number): number {
    const allowed = this.pageSizeOptions as readonly number[];
    return allowed.includes(value) ? value : this.defaultPerPage;
  }

  private _resetState(): void {
    this.digest.set(null);
    this.rows.set([]);
    this.pagination.set(null);
    this.loading.set(false);
    this.loadError.set(false);
    this.loadErrorMessage.set(null);
    this.closeActionDetail();
    this.mobileSummaryExpanded.set(false);
    this.hoveredRowId.set(null);
  }
}
