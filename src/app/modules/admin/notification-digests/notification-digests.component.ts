import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs';
import {
  NotificationDigestService,
  saveDigestPdfFile,
} from '@app/core/services/notification-digest/notification-digest.service';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import { WebsocketService } from '@app/core/services/websocket/websocket.service';
import { isValidCalendarIsoDate } from '@app/core/utils/iso-date.utils';
import {
  formatNotificationDigestViewedAt,
  NotificationDigestFilter,
  NotificationDigestListItem,
  NotificationDigestListMeta,
  NotificationDigestListQuery,
  NotificationDigestView,
  NotificationDigestViewedPayload,
} from '@app/core/models/notification-digest/notification-digest.model';
import { PendingDigestDetailComponent } from '@app/modules/admin/digest-packages/pages/pending-digest-detail/pending-digest-detail.component';
import {
  DateRange,
  DateRangePickerComponent,
} from '@app/shared/components/date-range-picker/date-range-picker.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '@app/shared/components/searchable-select/searchable-select.component';

const ADMIN_PRESENCE = 'admin.presence';
const VIEWED_EVENT = '.NotificationDigestViewed';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_ROW_MS = 4000;

type DateQueryKey =
  | 'registration_date_from'
  | 'registration_date_to'
  | 'action_date_from'
  | 'action_date_to'
  | 'created_at_from'
  | 'created_at_to'
  | 'term_start_date_from'
  | 'term_start_date_to'
  | 'term_end_date_from'
  | 'term_end_date_to';

const FILTER_QUERY_KEYS = [
  'organization_id',
  'process_number',
  'is_viewed',
  'registration_date_from',
  'registration_date_to',
  'action_date_from',
  'action_date_to',
  'created_at_from',
  'created_at_to',
  'term_start_date_from',
  'term_start_date_to',
  'term_end_date_from',
  'term_end_date_to',
] as const;

const DATE_RANGES: { control: DateRangeControl; fromKey: DateQueryKey; toKey: DateQueryKey }[] = [
  { control: 'registration_date_range', fromKey: 'registration_date_from', toKey: 'registration_date_to' },
  { control: 'action_date_range', fromKey: 'action_date_from', toKey: 'action_date_to' },
  { control: 'created_at_range', fromKey: 'created_at_from', toKey: 'created_at_to' },
  { control: 'term_start_date_range', fromKey: 'term_start_date_from', toKey: 'term_start_date_to' },
  { control: 'term_end_date_range', fromKey: 'term_end_date_from', toKey: 'term_end_date_to' },
];

type DateRangeControl =
  | 'registration_date_range'
  | 'action_date_range'
  | 'created_at_range'
  | 'term_start_date_range'
  | 'term_end_date_range';

function queryValue(params: ParamMap, key: string): string {
  const value = params.get(key)?.trim() ?? '';
  if (!value || value === 'null') return '';
  return value;
}

@Component({
  selector: 'app-notification-digests',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoPipe,
    DateRangePickerComponent,
    SearchableSelectComponent,
    PendingDigestDetailComponent,
  ],
  templateUrl: './notification-digests.component.html',
  styleUrl: './notification-digests.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDigestsComponent {
  readonly filtersSectionDomId = 'notification-digests-search-filters';
  loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMoreSentinel');

  private _service = inject(NotificationDigestService);
  private _organizations = inject(OrganizationService);
  private _ws = inject(WebsocketService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);
  private _document = inject(DOCUMENT);
  private _injector = inject(Injector);

  private _lang = toSignal(this._transloco.langChanges$, {
    initialValue: this._transloco.getActiveLang(),
  });

  private _destroyed = false;
  private _request = 0;
  private _viewsRequest = 0;
  private _joinedConnectionId = 0;
  private _loadedPage = 1;
  private _appliedQuery: NotificationDigestListQuery | null = null;
  private _intersectionObserver: IntersectionObserver | null = null;
  private _organizationRows = signal<Array<{ id: string; name: string }>>([]);
  /** Primera apertura vista en vivo, por si el GET en curso todavía trae is_viewed en false. */
  private _liveViewed = new Map<string, string | null>();
  private _flashTimers: ReturnType<typeof setTimeout>[] = [];
  private _pdfToastTimer: ReturnType<typeof setTimeout> | null = null;

  public showFilters = signal(false);
  public loading = signal(false);
  public loadingMore = signal(false);
  public hasMore = signal(false);
  public organizationsLoading = signal(true);
  public loadError = signal<string | null>(null);
  public items = signal<NotificationDigestListItem[]>([]);
  public pagination = signal<NotificationDigestListMeta | null>(null);
  public currentPerPage = signal(20);
  public liveViewedIds = signal<Set<string>>(new Set());
  public viewsDigest = signal<NotificationDigestListItem | null>(null);
  public views = signal<NotificationDigestView[]>([]);
  public viewsLoading = signal(false);
  public viewsError = signal<string | null>(null);
  public downloadingPdfId = signal<string | null>(null);
  public pdfToast = signal<string | null>(null);
  public detailTarget = signal<{
    organizationId: string;
    digestId: string;
    filters: NotificationDigestFilter;
  } | null>(null);

  public readonly filterForm = new FormGroup({
    organization_id: new FormControl('', { nonNullable: true }),
    process_number: new FormControl('', { nonNullable: true }),
    is_viewed: new FormControl<'0' | '1' | ''>('', { nonNullable: true }),
    registration_date_range: new FormControl<DateRange | null>(null),
    action_date_range: new FormControl<DateRange | null>(null),
    created_at_range: new FormControl<DateRange | null>(null),
    term_start_date_range: new FormControl<DateRange | null>(null),
    term_end_date_range: new FormControl<DateRange | null>(null),
  });

  organizationOptions = computed<SearchableSelectOption[]>(() => {
    this._lang();
    return [
      {
        id: '',
        label: this._transloco.translate('notificationDigests.filters.organizationAll'),
      },
      ...this._organizationRows().map((org) => ({ id: org.id, label: org.name })),
    ];
  });

  constructor() {
    this._destroyRef.onDestroy(() => {
      this._destroyed = true;
      this._intersectionObserver?.disconnect();
      for (const timer of this._flashTimers) clearTimeout(timer);
      if (this._pdfToastTimer) clearTimeout(this._pdfToastTimer);
      this._flashTimers = [];
      this._ws.leave(ADMIN_PRESENCE);
    });

    effect(() => {
      const connectionId = this._ws.connectionId();
      untracked(() => this._bindViewed(connectionId));
    });

    effect(
      () => {
        const el = this.loadMoreSentinel()?.nativeElement;
        this._intersectionObserver?.disconnect();
        this._intersectionObserver = null;
        if (!el) return;
        this._intersectionObserver = new IntersectionObserver(
          (entries) => {
            if (!entries[0]?.isIntersecting) return;
            this.loadMore();
          },
          { root: null, rootMargin: '240px', threshold: 0 },
        );
        this._intersectionObserver.observe(el);
      },
      { injector: this._injector },
    );

    this._loadFiltersFromQueryParams();
    this._loadOrganizations();
    this.load(1);

    this._route.queryParamMap.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      this._syncDetailFromQuery(params);
    });
  }

  load(page: number, options?: { append?: boolean }): void {
    const append = options?.append === true;
    const requestId = ++this._request;
    const query = append && this._appliedQuery
      ? { ...this._appliedQuery, page }
      : this._buildQuery(page);
    if ('error' in query) {
      this.loading.set(false);
      this.loadingMore.set(false);
      this.items.set([]);
      this.pagination.set(null);
      this.hasMore.set(false);
      this.loadError.set(query.error);
      return;
    }

    if (!append) {
      this._appliedQuery = query;
      this._syncQueryParams({ ...query, page: 1 });
      this.items.set([]);
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.loadError.set(null);
    this._service
      .list(query)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this._request || this._destroyed) return;
          const meta = response?.meta;
          if (!meta || !Array.isArray(response.data)) {
            this.loading.set(false);
            this.loadingMore.set(false);
            if (!append) {
              this.items.set([]);
              this.pagination.set(null);
              this.hasMore.set(false);
            }
            this.loadError.set(this._transloco.translate('notificationDigests.errors.loadFailed'));
            return;
          }
          const perPage = Number(meta.per_page) || this.currentPerPage();
          const rows = this._withLiveViewed(response.data);
          const current = Number(meta.current_page) || page;
          const last = Number(meta.last_page) || 1;
          if (append) this.items.update((prev) => [...prev, ...rows]);
          else this.items.set(rows);
          this._loadedPage = current;
          this.hasMore.set(current < last);
          this.pagination.set({
            current_page: current,
            per_page: perPage,
            total: Number(meta.total) || 0,
            last_page: last,
            from: meta.from == null ? 0 : Number(meta.from),
            to: meta.to == null ? 0 : Number(meta.to),
          });
          this.currentPerPage.set(perPage);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: (error: HttpErrorResponse) => {
          if (requestId !== this._request || this._destroyed) return;
          this.loading.set(false);
          this.loadingMore.set(false);
          if (!append) {
            this.items.set([]);
            this.pagination.set(null);
            this.hasMore.set(false);
          }
          this.loadError.set(this._apiError(error, 'notificationDigests.errors.loadFailed'));
        },
      });
  }

  loadMore(): void {
    if (this.loading() || this.loadingMore() || !this.hasMore() || this.loadError()) return;
    this.load(this._loadedPage + 1, { append: true });
  }

  retryLoad(): void {
    this.loadError.set(null);
    if (this.items().length > 0 && this.hasMore()) {
      this.loadMore();
      return;
    }
    this.load(1);
  }

  applyFilters(): void {
    this.load(1);
  }

  toggleFilters(): void {
    const wasOpen = this.showFilters();
    this.showFilters.update((value) => !value);
    if (wasOpen) return;
    afterNextRender(
      () => {
        this._document
          .getElementById(this.filtersSectionDomId)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { injector: this._injector },
    );
  }

  resetFilters(): void {
    this.filterForm.reset({
      organization_id: '',
      process_number: '',
      is_viewed: '',
      registration_date_range: null,
      action_date_range: null,
      created_at_range: null,
      term_start_date_range: null,
      term_end_date_range: null,
    });
    this.load(1);
  }

  onOrganizationFilter(value: string): void {
    this.filterForm.controls.organization_id.setValue(value);
  }

  downloadPdf(item: NotificationDigestListItem, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const id = item.id?.trim();
    if (!id || this.downloadingPdfId()) return;

    this.downloadingPdfId.set(id);
    this._service
      .exportPdf(id)
      .pipe(
        finalize(() => {
          if (!this._destroyed && this.downloadingPdfId() === id) this.downloadingPdfId.set(null);
        }),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (this._destroyed) return;
          if (!saveDigestPdfFile(response, id)) this._showPdfError();
        },
        error: () => {
          if (!this._destroyed) this._showPdfError();
        },
      });
  }

  openDigest(item: NotificationDigestListItem): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        ...this._listQueryParams(),
        digest: item.id,
        digest_organization: item.organization_id,
        digest_page: null,
        digest_per_page: null,
      },
      replaceUrl: true,
    });
  }

  closeDigest(): void {
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: this._listQueryParams(),
      replaceUrl: true,
    });
  }

  getPeriodClass(period: string): string {
    switch ((period || '').toLowerCase()) {
      case 'mañana':
      case 'manana':
        return 'manana';
      case 'tarde':
        return 'tarde';
      case 'noche':
        return 'noche';
      default:
        return 'manana';
    }
  }

  channelTooltip(at: string | null, pendingKey: string): string {
    const value = at?.trim();
    if (value) return value;
    return this._transloco.translate(pendingKey);
  }

  openViews(item: NotificationDigestListItem, event?: Event): void {
    event?.stopPropagation();
    if (!item.is_viewed) return;
    this.viewsDigest.set(item);
    this._loadViews(item.id);
  }

  closeViews(): void {
    this._viewsRequest += 1;
    this.viewsDigest.set(null);
    this.views.set([]);
    this.viewsLoading.set(false);
    this.viewsError.set(null);
  }

  retryViews(): void {
    const digest = this.viewsDigest();
    if (!digest) return;
    this._loadViews(digest.id);
  }

  viewFullName(view: NotificationDigestView): string {
    const name = [view.app_user_name, view.app_user_last_name]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return name || '–';
  }

  viewInitials(view: NotificationDigestView): string {
    const letters = [view.app_user_name, view.app_user_last_name]
      .map((part) => (part ?? '').trim().charAt(0))
      .filter(Boolean)
      .join('');
    return (letters || '?').slice(0, 2).toUpperCase();
  }

  private _loadViews(digestId: string, options?: { silent?: boolean }): void {
    const requestId = ++this._viewsRequest;
    const silent = options?.silent === true;
    if (!silent) {
      this.viewsLoading.set(true);
      this.viewsError.set(null);
      this.views.set([]);
    }

    this._service
      .getViews(digestId)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this._viewsRequest || this._destroyed) return;
          if (this.viewsDigest()?.id !== digestId) return;
          this.views.set(Array.isArray(response?.data) ? response.data : []);
          this.viewsError.set(null);
          this.viewsLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          if (requestId !== this._viewsRequest || this._destroyed) return;
          if (this.viewsDigest()?.id !== digestId) return;
          this.viewsLoading.set(false);
          if (!silent) this.views.set([]);
          this.viewsError.set(this._apiError(error, 'notificationDigests.views.errors.loadFailed'));
        },
      });
  }

  private _bindViewed(connectionId: number): void {
    if (this._destroyed || connectionId === 0) return;
    if (this._joinedConnectionId === connectionId) return;
    this._joinedConnectionId = connectionId;
    this._ws.listenPrivate(ADMIN_PRESENCE, VIEWED_EVENT, (payload: NotificationDigestViewedPayload) => {
      if (this._destroyed) return;
      this._onDigestViewed(payload);
    });
  }

  private _onDigestViewed(payload: Partial<NotificationDigestViewedPayload> | null | undefined): void {
    const id = payload?.notification_digest_id?.trim();
    if (!id) return;

    if (this.viewsDigest()?.id === id) {
      this._loadViews(id, { silent: true });
    }

    const current = this.items().find((row) => row.id === id);
    if (current?.is_viewed) return;

    if (!this._liveViewed.has(id)) {
      this._liveViewed.set(id, formatNotificationDigestViewedAt(payload?.viewed_at));
    }
    if (!current) return;

    const viewedAt = this._liveViewed.get(id) ?? null;
    this.items.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, is_viewed: true, viewed_at: viewedAt } : row)),
    );
    this._flash(id);
  }

  private _withLiveViewed(items: NotificationDigestListItem[]): NotificationDigestListItem[] {
    if (this._liveViewed.size === 0) return items;
    return items.map((item) => {
      if (!this._liveViewed.has(item.id)) return item;
      const live = this._liveViewed.get(item.id) ?? null;
      if (item.is_viewed) {
        this._liveViewed.delete(item.id);
        return item;
      }
      return { ...item, is_viewed: true, viewed_at: item.viewed_at || live };
    });
  }

  private _flash(id: string): void {
    this.liveViewedIds.update((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
      if (this._destroyed) return;
      this.liveViewedIds.update((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, LIVE_ROW_MS);
    this._flashTimers.push(timer);
  }

  private _loadFiltersFromQueryParams(): number {
    const params = this._route.snapshot.queryParamMap;
    const hasFilter = FILTER_QUERY_KEYS.some((key) => !!queryValue(params, key));
    if (hasFilter) this.showFilters.set(true);

    const organizationId = queryValue(params, 'organization_id');
    const processNumber = queryValue(params, 'process_number');
    const viewed = queryValue(params, 'is_viewed');
    this.filterForm.patchValue({
      organization_id: organizationId,
      process_number: processNumber,
      is_viewed: viewed === '1' || viewed === '0' ? viewed : '',
    });

    for (const entry of DATE_RANGES) {
      const from = queryValue(params, entry.fromKey);
      const to = queryValue(params, entry.toKey);
      if (!from && !to) continue;
      this.filterForm.controls[entry.control].setValue({ from: from || null, to: to || null });
    }

    const perPage = Number(queryValue(params, 'per_page'));
    if (Number.isFinite(perPage) && perPage >= 1 && perPage <= 100) {
      this.currentPerPage.set(Math.floor(perPage));
    }

    const page = Number(queryValue(params, 'page'));
    if (Number.isFinite(page) && page >= 1) return Math.floor(page);
    return 1;
  }

  private _syncQueryParams(query: NotificationDigestListQuery): void {
    const params = this._listQueryParams(query);
    const current = this._route.snapshot.queryParamMap;
    const digest = queryValue(current, 'digest');
    const digestOrganization = queryValue(current, 'digest_organization');
    if (digest && digestOrganization) {
      params['digest'] = digest;
      params['digest_organization'] = digestOrganization;
      const digestPage = queryValue(current, 'digest_page');
      const digestPerPage = queryValue(current, 'digest_per_page');
      if (digestPage && digestPage !== '1') params['digest_page'] = digestPage;
      if (digestPerPage && digestPerPage !== '20') params['digest_per_page'] = digestPerPage;
    }

    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: params,
      replaceUrl: true,
    });
  }

  private _listQueryParams(
    query: NotificationDigestListQuery | null = this._appliedQuery,
  ): Record<string, string | null> {
    const params: Record<string, string | null> = {};
    for (const key of FILTER_QUERY_KEYS) {
      params[key] = query?.[key]?.trim() || null;
    }
    params['page'] = query?.page && query.page > 1 ? String(query.page) : null;
    params['per_page'] = query?.per_page && query.per_page !== 20 ? String(query.per_page) : null;
    return params;
  }

  private _syncDetailFromQuery(params: ParamMap): void {
    const digestId = queryValue(params, 'digest');
    const organizationId = queryValue(params, 'digest_organization');
    if (!digestId || !organizationId) {
      if (this.detailTarget()) this.detailTarget.set(null);
      return;
    }

    const filters = this._detailFiltersFromParams(params);
    const current = this.detailTarget();
    if (
      current?.digestId === digestId &&
      current.organizationId === organizationId &&
      JSON.stringify(current.filters) === JSON.stringify(filters)
    ) {
      return;
    }

    this.detailTarget.set({ organizationId, digestId, filters });
  }

  private _detailFiltersFromParams(params: ParamMap): NotificationDigestFilter {
    const filters: NotificationDigestFilter = {};
    const keys = [
      'process_number',
      'registration_date_from',
      'registration_date_to',
      'action_date_from',
      'action_date_to',
      'term_start_date_from',
      'term_start_date_to',
      'term_end_date_from',
      'term_end_date_to',
    ] as const;
    for (const key of keys) {
      const value = queryValue(params, key);
      if (value) filters[key] = value;
    }
    return filters;
  }

  private _showPdfError(): void {
    if (this._pdfToastTimer) clearTimeout(this._pdfToastTimer);
    this.pdfToast.set(this._transloco.translate('notificationDigests.pdf.error'));
    this._pdfToastTimer = setTimeout(() => {
      if (this._destroyed) return;
      this.pdfToast.set(null);
      this._pdfToastTimer = null;
    }, 4000);
  }

  private _loadOrganizations(): void {
    this.organizationsLoading.set(true);
    this._organizations
      .getOrganizations({ per_page: 500 })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          this._organizationRows.set(
            (response.data ?? []).map((org) => ({ id: org.id, name: org.name })),
          );
          this.organizationsLoading.set(false);
        },
        error: () => {
          this.organizationsLoading.set(false);
        },
      });
  }

  private _buildQuery(page: number): NotificationDigestListQuery | { error: string } {
    const raw = this.filterForm.getRawValue();
    const organizationId = raw.organization_id.trim();
    if (organizationId && !UUID_PATTERN.test(organizationId)) {
      return { error: this._transloco.translate('notificationDigests.errors.invalidOrganization') };
    }

    const perPageNum = Number(this.currentPerPage());
    const query: NotificationDigestListQuery = {
      page,
      per_page: Number.isFinite(perPageNum) && perPageNum > 0 ? perPageNum : 20,
    };
    if (organizationId) query.organization_id = organizationId;

    const processNumber = raw.process_number.trim();
    if (processNumber) query.process_number = processNumber;
    if (raw.is_viewed === '1' || raw.is_viewed === '0') query.is_viewed = raw.is_viewed;

    const ranges: { range: DateRange | null; fromKey: DateQueryKey; toKey: DateQueryKey }[] =
      DATE_RANGES.map((entry) => ({
        range: raw[entry.control],
        fromKey: entry.fromKey,
        toKey: entry.toKey,
      }));

    for (const entry of ranges) {
      const error = this._applyRange(entry.range, entry.fromKey, entry.toKey, query);
      if (error) return { error };
    }
    return query;
  }

  private _applyRange(
    range: DateRange | null,
    fromKey: DateQueryKey,
    toKey: DateQueryKey,
    query: NotificationDigestListQuery,
  ): string | null {
    const from = range?.from?.trim() ?? '';
    const to = range?.to?.trim() ?? '';
    if (from && !isValidCalendarIsoDate(from)) {
      return this._transloco.translate('notificationDigests.errors.invalidDate');
    }
    if (to && !isValidCalendarIsoDate(to)) {
      return this._transloco.translate('notificationDigests.errors.invalidDate');
    }
    if (from && to && from > to) {
      return this._transloco.translate('notificationDigests.errors.rangeOrder');
    }
    if (from) query[fromKey] = from;
    if (to) query[toKey] = to;
    return null;
  }

  private _apiError(error: HttpErrorResponse, fallbackKey: string): string {
    const body = error?.error;
    if (body && typeof body === 'object') {
      const messages = Array.isArray(body.messages)
        ? body.messages.filter((item: unknown) => typeof item === 'string' && item.trim())
        : [];
      if (messages.length > 0) return messages.join(' ');

      const fieldErrors = body.errors;
      if (fieldErrors && typeof fieldErrors === 'object') {
        const parts: string[] = [];
        for (const value of Object.values(fieldErrors as Record<string, unknown>)) {
          if (!Array.isArray(value)) continue;
          for (const item of value) {
            if (typeof item === 'string' && item.trim()) parts.push(item);
          }
        }
        if (parts.length > 0) return parts.join(' ');
      }

      if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
    }
    return this._transloco.translate(fallbackKey);
  }
}
