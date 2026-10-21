import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { OrganizationService } from '@app/core/services/organization/organization.service';
import { PresenceService } from '@app/core/services/presence/presence.service';
import { WebsocketService } from '@app/core/services/websocket/websocket.service';
import { isValidCalendarIsoDate } from '@app/core/utils/iso-date.utils';
import {
  DailyPresenceQuery,
  DailyPresenceRow,
  OnlineUser,
  PresenceChannelMember,
  PresencePage,
  PresenceSummaryQuery,
  PresenceSummaryRow,
  PresenceSummaryTotals,
} from '@app/core/models/presence/presence.model';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '@app/shared/components/searchable-select/searchable-select.component';
import { DatePickerComponent } from '@app/shared/components/date-picker/date-picker.component';
import {
  DateRange,
  DateRangePickerComponent,
} from '@app/shared/components/date-range-picker/date-range-picker.component';

const APP_USERS_ONLINE = 'app-users.online';
const ADMIN_PRESENCE = 'admin.presence';
const ACTIVITY_EVENT = '.AppUserActivityRecorded';
const ONLINE_REFRESH_DEBOUNCE_MS = 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DailyMode = 'day' | 'range';
type SummaryPreset = 'today' | 'month' | 'custom';
type OnlineState = 'loading' | 'ready' | 'unavailable' | 'error';

function bogotaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function bogotaMonthBounds(now = new Date()): { from: string; to: string } {
  const [yearText, monthText] = bogotaToday(now).split('-');
  const lastDay = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate();
  return {
    from: `${yearText}-${monthText}-01`,
    to: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}

function isAdminMember(member: PresenceChannelMember | null | undefined): boolean {
  return member?.guard === 'admin' || member?.info?.guard === 'admin';
}

@Component({
  selector: 'app-presence',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoPipe,
    SearchableSelectComponent,
    DatePickerComponent,
    DateRangePickerComponent,
  ],
  templateUrl: './presence.component.html',
  styleUrl: './presence.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceComponent {
  private _presence = inject(PresenceService);
  private _organizations = inject(OrganizationService);
  private _ws = inject(WebsocketService);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  private _lang = toSignal(this._transloco.langChanges$, {
    initialValue: this._transloco.getActiveLang(),
  });

  private _destroyed = false;
  private _joinedConnectionId = 0;
  private _onlineRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _onlineRequest = 0;
  private _dailyRequest = 0;
  private _summaryRequest = 0;

  readonly pageSizeOptions = [10, 20, 50, 100] as const;

  organizationId = signal('');
  organizationsLoading = signal(true);
  private _organizationRows = signal<Array<{ id: string; name: string }>>([]);

  organizationOptions = computed<SearchableSelectOption[]>(() => {
    this._lang();
    return [
      { id: '', label: this._transloco.translate('presence.organizationAll') },
      ...this._organizationRows().map((org) => ({ id: org.id, label: org.name })),
    ];
  });

  socketLive = signal(false);
  onlineState = signal<OnlineState>('loading');
  onlineLoading = signal(true);
  onlineRefreshing = signal(false);
  onlineError = signal<string | null>(null);
  onlineUsers = signal<OnlineUser[]>([]);
  onlineTotal = signal<number | null>(null);

  dailyMode = signal<DailyMode>('day');
  dailyDate = signal(bogotaToday());
  dailyRange = signal<DateRange | null>(null);
  dailyLoading = signal(true);
  dailyError = signal<string | null>(null);
  dailyRows = signal<DailyPresenceRow[]>([]);
  dailyMeta = signal<PresencePage | null>(null);
  dailyPerPage = signal(20);

  summaryPreset = signal<SummaryPreset>('month');
  summaryRange = signal<DateRange | null>(null);
  summaryLoading = signal(true);
  summaryError = signal<string | null>(null);
  summaryRows = signal<PresenceSummaryRow[]>([]);
  summaryMeta = signal<PresencePage | null>(null);
  summaryPerPage = signal(20);
  summaryFrom = signal<string | null>(null);
  summaryTo = signal<string | null>(null);
  summaryTotals = signal<PresenceSummaryTotals | null>(null);

  constructor() {
    this._destroyRef.onDestroy(() => {
      this._destroyed = true;
      if (this._onlineRefreshTimer != null) {
        clearTimeout(this._onlineRefreshTimer);
        this._onlineRefreshTimer = null;
      }
      this._ws.leave(APP_USERS_ONLINE);
      this._ws.leave(ADMIN_PRESENCE);
    });

    effect(() => {
      const connectionId = this._ws.connectionId();
      untracked(() => this._bindPresence(connectionId));
    });

    this._loadOrganizations();
    this.loadOnline();
    this.loadDaily(1);
    this.loadSummary(1);
  }

  onOrganizationChange(value: string): void {
    if (value === this.organizationId()) return;
    this.organizationId.set(value);
    if (this._onlineRefreshTimer != null) {
      clearTimeout(this._onlineRefreshTimer);
      this._onlineRefreshTimer = null;
    }
    this.loadOnline();
    this.loadDaily(1);
    this.loadSummary(1);
  }

  loadOnline(options?: { silent?: boolean }): void {
    const requestId = ++this._onlineRequest;
    const silent = options?.silent === true;
    const org = this._organizationParam();

    if ('error' in org) {
      this.onlineLoading.set(false);
      this.onlineRefreshing.set(false);
      this.onlineError.set(org.error);
      this.onlineState.set('error');
      this.onlineUsers.set([]);
      this.onlineTotal.set(null);
      return;
    }

    if (silent) {
      this.onlineRefreshing.set(true);
    } else {
      this.onlineLoading.set(true);
      this.onlineState.set('loading');
      this.onlineError.set(null);
      this.onlineUsers.set([]);
      this.onlineTotal.set(null);
    }

    this._presence
      .getOnline(org.organization_id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this._onlineRequest || this._destroyed) return;
          this.onlineLoading.set(false);
          this.onlineRefreshing.set(false);
          this.onlineError.set(null);
          if (!response.presence_available) {
            this.onlineState.set('unavailable');
            this.onlineUsers.set([]);
            this.onlineTotal.set(null);
            return;
          }
          this.onlineState.set('ready');
          this.onlineUsers.set(response.users ?? []);
          this.onlineTotal.set(response.total ?? 0);
        },
        error: (error: HttpErrorResponse) => {
          if (requestId !== this._onlineRequest || this._destroyed) return;
          this.onlineLoading.set(false);
          this.onlineRefreshing.set(false);
          this.onlineError.set(this._apiError(error, 'presence.errors.loadOnline'));
          if (!silent) {
            this.onlineState.set('error');
            this.onlineUsers.set([]);
            this.onlineTotal.set(null);
          }
        },
      });
  }

  setDailyMode(mode: DailyMode): void {
    if (this.dailyMode() === mode) return;
    this.dailyMode.set(mode);
    if (mode === 'day') {
      if (!isValidCalendarIsoDate(this.dailyDate())) {
        this.dailyDate.set(bogotaToday());
      }
      this.loadDaily(1);
      return;
    }
    if (this.dailyRange()?.from && this.dailyRange()?.to) {
      this.loadDaily(1);
      return;
    }
    this._dailyRequest += 1;
    this.dailyLoading.set(false);
    this.dailyRows.set([]);
    this.dailyMeta.set(null);
    this.dailyError.set(null);
  }

  applyDailyToday(): void {
    this.dailyMode.set('day');
    this.dailyDate.set(bogotaToday());
    this.loadDaily(1);
  }

  applyDailyThisMonth(): void {
    this.dailyMode.set('range');
    this.dailyRange.set(bogotaMonthBounds());
    this.loadDaily(1);
  }

  onDailyDateChange(value: string | null): void {
    const next = (value ?? '').trim();
    if (next === this.dailyDate()) return;
    this.dailyDate.set(next);
    this.dailyMode.set('day');
    if (isValidCalendarIsoDate(next)) {
      this.loadDaily(1);
    }
  }

  onDailyRangeChange(range: DateRange | null): void {
    const from = range?.from ?? null;
    const to = range?.to ?? null;
    const current = this.dailyRange();
    if ((current?.from ?? null) === from && (current?.to ?? null) === to) return;
    this.dailyRange.set({ from, to });
    this.dailyMode.set('range');
    if (from && to) this.loadDaily(1);
  }

  isDailyToday(): boolean {
    return this.dailyMode() === 'day' && this.dailyDate() === bogotaToday();
  }

  isDailyThisMonth(): boolean {
    if (this.dailyMode() !== 'range') return false;
    const range = this.dailyRange();
    const month = bogotaMonthBounds();
    return range?.from === month.from && range?.to === month.to;
  }

  dailyRangePending(): boolean {
    return this.dailyMode() === 'range' && !(this.dailyRange()?.from && this.dailyRange()?.to);
  }

  loadDaily(page: number, options?: { silent?: boolean }): void {
    const requestId = ++this._dailyRequest;
    const silent = options?.silent === true;
    const query = this._dailyQuery(page);
    if ('error' in query) {
      if (silent) return;
      this.dailyLoading.set(false);
      this.dailyRows.set([]);
      this.dailyMeta.set(null);
      this.dailyError.set(this.dailyRangePending() ? null : query.error);
      return;
    }

    if (!silent) {
      this.dailyLoading.set(true);
      this.dailyError.set(null);
    }
    this._presence
      .getToday(query)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this._dailyRequest || this._destroyed) return;
          this.dailyLoading.set(false);
          this.dailyRows.set(response.data ?? []);
          const perPage = Number(response.per_page) || this.dailyPerPage();
          this.dailyPerPage.set(perPage);
          this.dailyMeta.set({
            current_page: Number(response.current_page) || 1,
            per_page: perPage,
            total: Number(response.total) || 0,
            last_page: Number(response.last_page) || 1,
          });
        },
        error: (error: HttpErrorResponse) => {
          if (requestId !== this._dailyRequest || this._destroyed) return;
          this.dailyLoading.set(false);
          if (silent) return;
          this.dailyRows.set([]);
          this.dailyMeta.set(null);
          this.dailyError.set(this._apiError(error, 'presence.errors.loadDaily'));
        },
      });
  }

  applySummaryToday(): void {
    this.summaryPreset.set('today');
    this.loadSummary(1);
  }

  applySummaryMonth(): void {
    this.summaryPreset.set('month');
    this.loadSummary(1);
  }

  applySummaryCustom(): void {
    this.summaryPreset.set('custom');
    if (this.summaryRange()?.from && this.summaryRange()?.to) {
      this.loadSummary(1);
      return;
    }
    this.summaryError.set(null);
  }

  onSummaryRangeChange(range: DateRange | null): void {
    const from = range?.from ?? null;
    const to = range?.to ?? null;
    const current = this.summaryRange();
    if ((current?.from ?? null) === from && (current?.to ?? null) === to) return;
    this.summaryRange.set({ from, to });
    this.summaryPreset.set('custom');
    if (from && to) this.loadSummary(1);
  }

  summaryRangePending(): boolean {
    return this.summaryPreset() === 'custom' && !(this.summaryRange()?.from && this.summaryRange()?.to);
  }

  loadSummary(page: number, options?: { silent?: boolean }): void {
    const requestId = ++this._summaryRequest;
    const silent = options?.silent === true;
    const query = this._summaryQuery(page);
    if ('error' in query) {
      if (silent) return;
      this.summaryLoading.set(false);
      this.summaryRows.set([]);
      this.summaryMeta.set(null);
      this.summaryTotals.set(null);
      this.summaryFrom.set(null);
      this.summaryTo.set(null);
      this.summaryError.set(this.summaryRangePending() ? null : query.error);
      return;
    }

    if (!silent) {
      this.summaryLoading.set(true);
      this.summaryError.set(null);
      this.summaryTotals.set(null);
    }
    this._presence
      .getSummary(query)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this._summaryRequest || this._destroyed) return;
          this.summaryLoading.set(false);
          this.summaryRows.set(response.data ?? []);
          const perPage = Number(response.per_page) || this.summaryPerPage();
          this.summaryPerPage.set(perPage);
          this.summaryFrom.set(response.from ?? null);
          this.summaryTo.set(response.to ?? null);
          this.summaryTotals.set(response.totals ?? null);
          this.summaryMeta.set({
            current_page: Number(response.current_page) || 1,
            per_page: perPage,
            total: Number(response.total) || 0,
            last_page: Number(response.last_page) || 1,
          });
        },
        error: (error: HttpErrorResponse) => {
          if (requestId !== this._summaryRequest || this._destroyed) return;
          this.summaryLoading.set(false);
          if (silent) return;
          this.summaryRows.set([]);
          this.summaryMeta.set(null);
          this.summaryTotals.set(null);
          this.summaryFrom.set(null);
          this.summaryTo.set(null);
          this.summaryError.set(this._apiError(error, 'presence.errors.loadSummary'));
        },
      });
  }

  readonly changeDailyPage = (page: number): void => {
    const meta = this.dailyMeta();
    if (!meta || page < 1 || page > meta.last_page || page === meta.current_page) return;
    this.loadDaily(page);
  };

  readonly changeDailyPerPage = (perPage: number): void => {
    const next = Math.min(100, Math.max(1, Number(perPage) || 20));
    if (next === this.dailyPerPage()) return;
    this.dailyPerPage.set(next);
    this.loadDaily(1);
  };

  readonly changeSummaryPage = (page: number): void => {
    const meta = this.summaryMeta();
    if (!meta || page < 1 || page > meta.last_page || page === meta.current_page) return;
    this.loadSummary(page);
  };

  readonly changeSummaryPerPage = (perPage: number): void => {
    const next = Math.min(100, Math.max(1, Number(perPage) || 20));
    if (next === this.summaryPerPage()) return;
    this.summaryPerPage.set(next);
    this.loadSummary(1);
  };

  pageNumbers(meta: PresencePage): number[] {
    const last = Math.max(meta.last_page, 1);
    const current = Math.min(Math.max(meta.current_page, 1), last);
    let start = Math.max(1, current - 2);
    let end = Math.min(last, current + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(last, start + 4);
      else start = Math.max(1, end - 4);
    }
    const pages: number[] = [];
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  }

  showing(meta: PresencePage): { from: number; to: number } {
    if (meta.total <= 0) return { from: 0, to: 0 };
    const from = (meta.current_page - 1) * meta.per_page + 1;
    const to = Math.min(meta.current_page * meta.per_page, meta.total);
    return { from, to };
  }

  fullName(person: { name: string | null; last_name: string | null }): string {
    const name = [person.name, person.last_name]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return name || '–';
  }

  onlineOrganization(user: OnlineUser): string {
    const primary = user.organization_name?.trim();
    if (primary) return primary;
    const names = (user.organizations ?? [])
      .map((org) => org.name?.trim())
      .filter((name): name is string => !!name);
    return names.join(', ') || '–';
  }

  organizationName(row: { organization_name: string | null }): string {
    return row.organization_name?.trim() || '–';
  }

  formatDay(value: string | null | undefined): string {
    if (!value) return '–';
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '–';
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) return value;
    return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
  }

  private _bindPresence(connectionId: number): void {
    if (this._destroyed || connectionId === 0) return;
    if (this._joinedConnectionId === connectionId) return;
    this._joinedConnectionId = connectionId;
    this.socketLive.set(false);

    const channel = this._ws.echo.join(APP_USERS_ONLINE);
    channel
      .here(() => {
        if (this._destroyed) return;
        this.socketLive.set(true);
        this._scheduleOnlineRefresh();
      })
      .joining((member: PresenceChannelMember) => {
        if (this._destroyed || isAdminMember(member)) return;
        this._scheduleOnlineRefresh();
      })
      .leaving((member: PresenceChannelMember) => {
        if (this._destroyed || isAdminMember(member)) return;
        this._scheduleOnlineRefresh();
      })
      .error(() => {
        if (this._destroyed) return;
        this.socketLive.set(false);
      });

    this._ws.listenPrivate(ADMIN_PRESENCE, ACTIVITY_EVENT, () => {
      if (this._destroyed) return;
      this._scheduleOnlineRefresh();
    });
  }

  private _scheduleOnlineRefresh(): void {
    if (this._onlineRefreshTimer != null) clearTimeout(this._onlineRefreshTimer);
    this._onlineRefreshTimer = setTimeout(() => {
      this._onlineRefreshTimer = null;
      if (this._destroyed) return;
      this.loadOnline({ silent: true });
      this.loadDaily(this.dailyMeta()?.current_page ?? 1, { silent: true });
      this.loadSummary(this.summaryMeta()?.current_page ?? 1, { silent: true });
    }, ONLINE_REFRESH_DEBOUNCE_MS);
  }

  private _loadOrganizations(): void {
    this.organizationsLoading.set(true);
    this._organizations
      .getOrganizations({ per_page: 500 })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (response) => {
          this._organizationRows.set(
            (response.data ?? []).map((org) => ({ id: org.id, name: org.name }))
          );
          this.organizationsLoading.set(false);
        },
        error: () => {
          this.organizationsLoading.set(false);
        },
      });
  }

  private _organizationParam(): { organization_id?: string } | { error: string } {
    const organizationId = this.organizationId().trim();
    if (!organizationId) return {};
    if (!UUID_PATTERN.test(organizationId)) {
      return { error: this._transloco.translate('presence.errors.invalidOrganization') };
    }
    return { organization_id: organizationId };
  }

  private _dailyQuery(page: number): DailyPresenceQuery | { error: string } {
    const org = this._organizationParam();
    if ('error' in org) return org;
    const perPage = this.dailyPerPage();
    if (this.dailyMode() === 'day') {
      const date = this.dailyDate().trim();
      if (!isValidCalendarIsoDate(date)) {
        return { error: this._transloco.translate('presence.errors.invalidDate') };
      }
      return { ...org, date, page, per_page: perPage };
    }
    const from = this.dailyRange()?.from ?? '';
    const to = this.dailyRange()?.to ?? '';
    if (!from || !to) {
      return { error: this._transloco.translate('presence.errors.rangeIncomplete') };
    }
    if (!isValidCalendarIsoDate(from) || !isValidCalendarIsoDate(to)) {
      return { error: this._transloco.translate('presence.errors.invalidDate') };
    }
    if (from > to) {
      return { error: this._transloco.translate('presence.errors.rangeOrder') };
    }
    return { ...org, from, to, page, per_page: perPage };
  }

  private _summaryQuery(page: number): PresenceSummaryQuery | { error: string } {
    const org = this._organizationParam();
    if ('error' in org) return org;
    const base: PresenceSummaryQuery = {
      ...org,
      page,
      per_page: this.summaryPerPage(),
    };
    if (this.summaryPreset() === 'month') return base;
    if (this.summaryPreset() === 'today') {
      const today = bogotaToday();
      return { ...base, from: today, to: today };
    }
    const from = this.summaryRange()?.from ?? '';
    const to = this.summaryRange()?.to ?? '';
    if (!from || !to) {
      return { error: this._transloco.translate('presence.errors.rangeIncomplete') };
    }
    if (!isValidCalendarIsoDate(from) || !isValidCalendarIsoDate(to)) {
      return { error: this._transloco.translate('presence.errors.invalidDate') };
    }
    if (from > to) {
      return { error: this._transloco.translate('presence.errors.rangeOrder') };
    }
    return { ...base, from, to };
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
    }
    return this._transloco.translate(fallbackKey);
  }
}
