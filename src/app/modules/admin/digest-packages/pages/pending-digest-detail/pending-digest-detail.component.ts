import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NotificationDigestService } from '@app/core/services/notification-digest/notification-digest.service';
import {
  NotificationDigestDetail,
  NotificationDigestDetailItem,
  NotificationDigestDetailResponse,
  NotificationDigestDisplayRow,
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

  /** Organización cuyo consolidado pendiente se muestra. Null = modal cerrada. */
  public organizationId = input<string | null>(null);
  public closed = output<void>();

  public readonly pageSizeOptions = [10, 20, 25, 50, 100] as const;
  public readonly defaultPerPage = 20;

  public digest = signal<NotificationDigestDetail | null>(null);
  public rows = signal<NotificationDigestDisplayRow[]>([]);
  public loading = signal(false);
  public loadError = signal(false);

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
  public mobileSummaryExpanded = signal(false);
  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadedOrgId: string | null = null;

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
      if (!orgId) {
        this._resetState();
        this._loadedOrgId = null;
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

    this.loading.set(true);
    this.loadError.set(false);
    this.currentPage.set(page);
    this.currentPerPage.set(perPage);
    this.syncQueryParams(orgId, page, perPage);

    this._service.getPending(orgId, page, perPage).subscribe({
      next: (response) => {
        this.applyResponse(response);
        this._loadedOrgId = orgId;
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
        this.digest.set(null);
        this.rows.set([]);
        this.pagination.set(null);
        this._loadedOrgId = orgId;
      },
    });
  }

  close(): void {
    this.closeActionDetail();
    this.closed.emit();
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
    this.closeActionDetail();
    this.mobileSummaryExpanded.set(false);
    this.hoveredRowId.set(null);
  }
}
