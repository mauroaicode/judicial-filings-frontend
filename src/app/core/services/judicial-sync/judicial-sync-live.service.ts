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
  private readonly _listening = signal(false);

  readonly activeSources = this._activeSources.asReadonly();

  private _stopped = true;
  private _joinedConnectionId = 0;
  private _epoch = 0;
  private _fetchGen = 0;
  private _sourceEpoch = new Map<string, number>();
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
    this._sourceEpoch.clear();
    this._epoch = 0;
    this._activeSources.set([]);
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
    const localMap = new Map(local.map((item) => [item.data_source, item]));
    const consumed = new Set<string>();
    const next: JudicialSyncLiveSource[] = [];

    for (const apiItem of apiActive) {
      consumed.add(apiItem.data_source);
      const localEpoch = this._sourceEpoch.get(apiItem.data_source) ?? 0;
      const localItem = localMap.get(apiItem.data_source);
      if (localEpoch > epochAtStart) {
        if (localItem?.is_active) next.push(localItem);
        continue;
      }
      next.push(apiItem);
    }

    for (const localItem of local) {
      if (consumed.has(localItem.data_source)) continue;
      const localEpoch = this._sourceEpoch.get(localItem.data_source) ?? 0;
      if (localEpoch > epochAtStart && localItem.is_active) {
        next.push(localItem);
      }
    }

    this._activeSources.set(next);
  }

  private _applyEvent(payload: unknown): void {
    const event = this._asEvent(payload);
    if (!event) return;

    this._epoch += 1;
    this._sourceEpoch.set(event.data_source, this._epoch);

    this._activeSources.update((current) => {
      if (!event.is_active) {
        return current.filter((item) => item.data_source !== event.data_source);
      }

      const index = current.findIndex((item) => item.data_source === event.data_source);
      const previous = index >= 0 ? current[index] : undefined;
      const nextSource = this._sourceFromEvent(event, previous);
      if (index >= 0) {
        const next = current.slice();
        next[index] = nextSource;
        return next;
      }
      return [...current, nextSource];
    });
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
      run_id: typeof event.run_id === 'string' ? event.run_id : null,
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
    };
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
    // `active` es la lista canónica; si llega vacía con fuentes `is_active`, usar `sources`.
    const listed = fromActive.length > 0 ? fromActive : fromSources;

    return listed.filter(
      (source): source is JudicialSyncLiveSource =>
        !!source && source.is_active === true && typeof source.data_source === 'string' && source.data_source !== '',
    );
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
