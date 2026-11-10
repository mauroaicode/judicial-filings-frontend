import { effect, inject, Injectable, PLATFORM_ID, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  JudicialSyncLiveSource,
  JudicialSyncLiveStatusResponse,
  JudicialSyncStatusUpdatedEvent,
} from '@app/core/models/judicial-sync/judicial-sync.model';
import { WebsocketService } from '@app/core/services/websocket/websocket.service';
import { JudicialSyncService } from './judicial-sync.service';

const ADMIN_JUDICIAL_SYNC = 'admin.judicial-sync';
const STATUS_EVENT = '.JudicialSyncStatusUpdated';
const FOCUS_REFRESH_MS = 400;

interface ReverbConnection {
  state?: string;
  bind: (event: string, callback: () => void) => void;
  unbind: (event: string, callback: () => void) => void;
}

/**
 * Estado global del banner de sincronización.
 * HTTP solo en el arranque del shell, al recuperar el foco y al reconectar Echo.
 * El progreso llega por el canal privado `admin.judicial-sync`.
 */
@Injectable({
  providedIn: 'root',
})
export class JudicialSyncLiveService {
  private _sync = inject(JudicialSyncService);
  private _ws = inject(WebsocketService);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _activeSources = signal<JudicialSyncLiveSource[]>([]);
  /** Cierre de batch (completado / cancelado / error) recibido por WS. */
  private readonly _terminalByKey = signal<Record<string, JudicialSyncStatusUpdatedEvent>>({});
  private readonly _runLiveTick = signal(0);
  private readonly _listening = signal(false);

  readonly activeSources = this._activeSources.asReadonly();
  readonly terminalEvents = this._terminalByKey.asReadonly();
  /** Sube en cada cambio de activos o de estado terminal (historial en vivo). */
  readonly runLiveTick = this._runLiveTick.asReadonly();

  private _stopped = true;
  private _joinedConnectionId = 0;
  private _epoch = 0;
  private _fetchGen = 0;
  /** Epoch del último evento WS, por run (no por data_source: global y organización conviven). */
  private _chipEpoch = new Map<string, number>();
  private _refreshSub: Subscription | null = null;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _pusherConnection: ReverbConnection | null = null;
  private _onPusherConnected: (() => void) | null = null;
  private _ignoreNextConnected = false;
  private _windowListenersAttached = false;

  private readonly _onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.scheduleRefresh();
  };

  private readonly _onWindowFocus = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.scheduleRefresh();
  };

  constructor() {
    effect(() => {
      const connectionId = this._ws.connectionId();
      const listening = this._listening();
      untracked(() => this._syncSubscription(connectionId, listening));
    });
  }

  /** Lo llama el layout autenticado: el banner queda vivo en cualquier ruta. */
  start(): void {
    if (this._listening()) return;
    this._stopped = false;
    this._attachWindowListeners();
    this._listening.set(true);
    this._fetchSnapshot();
  }

  stop(): void {
    this._stopped = true;
    this._joinedConnectionId = 0;
    this._detachWindowListeners();
    this._clearRefreshTimer();
    this._refreshSub?.unsubscribe();
    this._refreshSub = null;
    this._unbindPusher();
    this._ws.leave(ADMIN_JUDICIAL_SYNC);
    this._chipEpoch.clear();
    this._epoch = 0;
    this._activeSources.set([]);
    this._terminalByKey.set({});
    this._runLiveTick.set(0);
    this._listening.set(false);
  }

  /** Relectura HTTP (foco o reconexión). No sustituye al WebSocket. */
  scheduleRefresh(): void {
    if (this._stopped) return;
    if (this._refreshTimer != null) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (this._stopped) return;
      this._fetchSnapshot();
    }, FOCUS_REFRESH_MS);
  }

  private _syncSubscription(connectionId: number, listening: boolean): void {
    if (!listening || this._stopped || connectionId === 0) return;
    if (this._joinedConnectionId === connectionId) return;

    const echo = this._ws.echo;
    // Pedir Echo puede recrear la conexión y subir connectionId. En ese caso
    // el effect vuelve a entrar; no hay que escuchar dos veces.
    if (this._stopped || this._ws.connectionId() !== connectionId) return;

    const isReconnect = this._joinedConnectionId !== 0;
    this._joinedConnectionId = connectionId;
    this._unbindPusher();
    this._bindPusher(echo);

    try {
      const channel = echo.private(ADMIN_JUDICIAL_SYNC);
      channel.stopListening(STATUS_EVENT);
      channel.listen(STATUS_EVENT, (payload: unknown) => {
        if (this._stopped) return;
        this._applyEvent(payload);
      });
    } catch {
      // El snapshot HTTP sigue siendo la fuente de bootstrap aunque Echo falle.
    }

    if (isReconnect) {
      this._fetchSnapshot();
    }
  }

  private _bindPusher(echo: { connector?: { pusher?: { connection?: ReverbConnection } } }): void {
    const connection = echo.connector?.pusher?.connection;
    if (!connection || typeof connection.bind !== 'function') return;

    this._pusherConnection = connection;
    this._ignoreNextConnected = connection.state !== 'connected';
    this._onPusherConnected = () => {
      if (this._ignoreNextConnected) {
        this._ignoreNextConnected = false;
        return;
      }
      if (this._stopped) return;
      this.scheduleRefresh();
    };
    connection.bind('connected', this._onPusherConnected);
  }

  private _unbindPusher(): void {
    if (this._pusherConnection && this._onPusherConnected) {
      this._pusherConnection.unbind('connected', this._onPusherConnected);
    }
    this._pusherConnection = null;
    this._onPusherConnected = null;
    this._ignoreNextConnected = false;
  }

  private _fetchSnapshot(): void {
    if (this._stopped) return;
    const epochAtStart = this._epoch;
    const gen = ++this._fetchGen;
    this._refreshSub?.unsubscribe();
    this._refreshSub = this._sync.getJudicialSyncLiveStatus().subscribe({
      next: (response) => {
        if (this._stopped || gen !== this._fetchGen) return;
        this._applySnapshot(this._activeFromResponse(response), epochAtStart);
      },
      error: () => {
        // Un fallo transitorio no oculta un sync que el socket sigue reportando.
      },
    });
  }

  private _applySnapshot(apiActive: JudicialSyncLiveSource[], epochAtStart: number): void {
    if (this._epoch === epochAtStart) {
      this._activeSources.set(apiActive);
      return;
    }

    const local = this._activeSources();
    const localMap = new Map(local.map((item) => [this._chipKey(item), item]));
    const consumed = new Set<string>();
    const next: JudicialSyncLiveSource[] = [];

    for (const apiItem of apiActive) {
      const key = this._chipKey(apiItem);
      consumed.add(key);
      const localEpoch = this._chipEpoch.get(key) ?? 0;
      const localItem = localMap.get(key);
      if (localEpoch > epochAtStart) {
        if (localItem?.is_active) next.push(localItem);
        continue;
      }
      next.push(apiItem);
    }

    for (const localItem of local) {
      const key = this._chipKey(localItem);
      if (consumed.has(key)) continue;
      const localEpoch = this._chipEpoch.get(key) ?? 0;
      if (localEpoch > epochAtStart && localItem.is_active) {
        next.push(localItem);
      }
    }

    this._activeSources.set(next);
    this._bumpRunLive();
  }

  private _applyEvent(payload: unknown): void {
    const event = this._asEvent(payload);
    if (!event) return;

    this._epoch += 1;
    const key = this._chipKey(event);
    this._chipEpoch.set(key, this._epoch);

    if (event.is_active) {
      this._clearTerminalForChip(event);
    } else {
      this._storeTerminal(event);
    }

    this._activeSources.update((current) => {
      if (!event.is_active) {
        return current.filter((item) => this._chipKey(item) !== key);
      }

      const index = current.findIndex((item) => this._chipKey(item) === key);
      const previous = index >= 0 ? current[index] : undefined;
      const nextSource = this._sourceFromEvent(event, previous);
      if (index >= 0) {
        const next = current.slice();
        next[index] = nextSource;
        return next;
      }
      return [...current, nextSource];
    });
    this._bumpRunLive();
  }

  private _bumpRunLive(): void {
    this._runLiveTick.update((value) => value + 1);
  }

  private _storeTerminal(event: JudicialSyncStatusUpdatedEvent): void {
    this._terminalByKey.update((current) => {
      const next = { ...current };
      for (const key of this._terminalKeysForEvent(event)) {
        next[key] = event;
      }
      return next;
    });
  }

  /** Solo borra el cierre de este run. Un cron de organización no limpia el global de la misma fuente. */
  private _clearTerminalForChip(event: JudicialSyncStatusUpdatedEvent): void {
    const key = this._chipKey(event);
    this._terminalByKey.update((current) => {
      const next = { ...current };
      for (const terminal of Object.values(current)) {
        if (this._chipKey(terminal) !== key) continue;
        for (const alias of this._terminalKeysForEvent(terminal)) {
          delete next[alias];
        }
      }
      return next;
    });
  }

  private _terminalKeysForEvent(event: JudicialSyncStatusUpdatedEvent): string[] {
    const keys: string[] = [];
    if (event.run_id) keys.push(`run:${event.run_id}`);
    if (event.laravel_batch_id) keys.push(`batch:${event.laravel_batch_id}`);
    if (!event.organization_id && !event.organization_name) {
      keys.push(`source:${event.data_source}`);
    }
    if (keys.length === 0) keys.push(this._chipKey(event));
    return keys;
  }

  /**
   * Identidad del chip. `run_id` manda: el cron global y el de una organización
   * comparten `data_source` y no deben pisarse.
   */
  private _chipKey(item: {
    run_id?: string | null;
    data_source: string;
    organization_id?: string | null;
  }): string {
    const runId = item.run_id?.trim();
    if (runId) return `run:${runId}`;
    const orgId = item.organization_id?.trim();
    if (orgId) return `org:${item.data_source}:${orgId}`;
    return `source:${item.data_source}`;
  }

  private _sourceFromEvent(
    event: JudicialSyncStatusUpdatedEvent,
    previous: JudicialSyncLiveSource | undefined,
  ): JudicialSyncLiveSource {
    const label = event.data_source_label.trim() || previous?.data_source_label || event.data_source;
    return {
      data_source: event.data_source,
      data_source_label: label,
      is_active: true,
      is_executable: previous?.is_executable ?? true,
      run_id: event.run_id ?? previous?.run_id ?? null,
      status: event.status,
      status_label: event.status_label,
      processes_queued: event.processes_queued,
      queue_pending_jobs: event.queue_pending_jobs,
      failed_jobs_count: event.failed_jobs_count,
      laravel_batch_id: event.laravel_batch_id,
      started_at: event.started_at,
      radicado_filter: previous?.radicado_filter ?? null,
      organization_id: event.organization_id,
      organization_name: event.organization_name,
    };
  }

  private _asEvent(payload: unknown): JudicialSyncStatusUpdatedEvent | null {
    if (!payload || typeof payload !== 'object') return null;
    const event = payload as Partial<JudicialSyncStatusUpdatedEvent>;
    const dataSource = typeof event.data_source === 'string' ? event.data_source.trim() : '';
    if (!dataSource || typeof event.is_active !== 'boolean') return null;

    const pending = this._nullableCount(event.queue_pending_jobs);
    const failed = this._nullableCount(event.failed_jobs_count);

    return {
      run_id: typeof event.run_id === 'string' && event.run_id.trim() ? event.run_id.trim() : null,
      data_source: dataSource,
      data_source_label: typeof event.data_source_label === 'string' ? event.data_source_label : '',
      status: typeof event.status === 'string' ? event.status : null,
      status_label: typeof event.status_label === 'string' ? event.status_label : null,
      is_active: event.is_active,
      processes_queued: typeof event.processes_queued === 'number' ? event.processes_queued : 0,
      queue_pending_jobs: pending === undefined ? null : pending,
      failed_jobs_count: failed === undefined ? null : failed,
      laravel_batch_id: typeof event.laravel_batch_id === 'string' ? event.laravel_batch_id : null,
      started_at: typeof event.started_at === 'string' ? event.started_at : null,
      organization_id: this._nullableText(event.organization_id),
      organization_name: this._nullableText(event.organization_name),
    };
  }

  private _nullableText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  /** `undefined` si el campo no vino; `null` si el batch aún se prepara. */
  private _nullableCount(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private _activeFromResponse(response: JudicialSyncLiveStatusResponse): JudicialSyncLiveSource[] {
    const fromActive = Array.isArray(response?.active) ? response.active : [];
    const fromSources = Array.isArray(response?.sources)
      ? response.sources.filter((source) => source?.is_active === true)
      : [];
    // `active` es la lista canónica (un chip por run, global y por organización).
    // `sources` solo describe el cron global y se usa si `active` llega vacío.
    const listed = fromActive.length > 0 ? fromActive : fromSources;

    const byKey = new Map<string, JudicialSyncLiveSource>();
    for (const source of listed) {
      if (!source || source.is_active === false) continue;
      if (typeof source.data_source !== 'string' || source.data_source === '') continue;
      const normalized = this._normalizeLiveSource(source);
      byKey.set(this._chipKey(normalized), normalized);
    }
    return [...byKey.values()];
  }

  private _normalizeLiveSource(source: JudicialSyncLiveSource): JudicialSyncLiveSource {
    const runId = typeof source.run_id === 'string' ? source.run_id.trim() : '';
    return {
      ...source,
      is_active: true,
      run_id: runId || null,
      organization_id: this._nullableText(source.organization_id),
      organization_name: this._nullableText(source.organization_name),
    };
  }

  private _attachWindowListeners(): void {
    if (!this._isBrowser || this._windowListenersAttached) return;
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('focus', this._onWindowFocus);
    this._windowListenersAttached = true;
  }

  private _detachWindowListeners(): void {
    if (!this._isBrowser || !this._windowListenersAttached) return;
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('focus', this._onWindowFocus);
    this._windowListenersAttached = false;
  }

  private _clearRefreshTimer(): void {
    if (this._refreshTimer != null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
}
