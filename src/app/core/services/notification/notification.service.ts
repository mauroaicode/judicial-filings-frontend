import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import { AppNotification, NotificationResponse, UnreadCountResponse } from '@app/core/models/notification/notification.model';
import { ManualRegistrationService } from '@app/core/services/process/manual-registration.service';
import { ProcessExportService } from '@app/core/services/process/process-export.service';
import { normalizeNotificationBusinessType } from '@app/core/constants/notification-navigation.constant';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private _httpClient = inject(HttpClient);
    private _manualRegistrationService = inject(ManualRegistrationService);
    private _processExportService = inject(ProcessExportService);

    // State
    private _notifications = signal<AppNotification[]>([]);
    private _unreadCount = signal<number>(0);
    /** Contador de la campana (notificaciones no “abiertas” hasta mark-all-opened) */
    private _newCount = signal<number>(0);

    public readonly notifications = this._notifications.asReadonly();
    public readonly unreadCount = this._unreadCount.asReadonly();
    public readonly newCount = this._newCount.asReadonly();

    /**
     * Fetch unread count from API
     */
    getUnreadCount(): Observable<UnreadCountResponse> {
        const url = `${environment.apiBaseUrl}/notifications/unread-count`;
        return this._httpClient.get<UnreadCountResponse>(url).pipe(
            tap((res) => {
                this._unreadCount.set(res.unread_count);
                this._newCount.set(res.new_count ?? res.unread_count);
            })
        );
    }

    /**
     * Marca todas como abiertas (quita el número de la campana). POST notifications/mark-all-opened
     */
    markAllAsOpened(): Observable<unknown> {
        const url = `${environment.apiBaseUrl}/notifications/mark-all-opened`;
        const openedAt = new Date().toISOString();

        this._newCount.set(0);
        this._notifications.update((current) =>
            current.map((n) => (n.opened_at ? n : { ...n, opened_at: openedAt }))
        );

        return this._httpClient.post(url, {}).pipe(
            catchError((error) => {
                console.error('Error marking admin notifications as opened:', error);
                this.getUnreadCount().subscribe();
                return of(null);
            })
        );
    }

    /**
     * Fetch latest notifications
     */
    getNotifications(page: number = 1): Observable<NotificationResponse> {
        const url = `${environment.apiBaseUrl}/notifications?page=${page}`;
        return this._httpClient.get<NotificationResponse>(url).pipe(
            tap((res: any) => {
                // Laravel pagination response might be nested (res.data.data) or simple (res.data)
                const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);

                if (page === 1) {
                    this._notifications.set(items);
                } else {
                    this._notifications.update(current => [...current, ...items]);
                }
            })
        );
    }

    /**
     * Mark a notification as read
     */
    markAsRead(id: string): Observable<any> {
        const url = `${environment.apiBaseUrl}/notifications/${id}/read`;
        return this._httpClient.post(url, {}).pipe(
            tap(() => {
                // Update local state
                this._notifications.update(current =>
                    current.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
                );
                // Decrease unread count
                this._unreadCount.update(count => Math.max(0, count - 1));
            })
        );
    }

    /**
     * Handle incoming WebSocket notification
     */
    handleIncomingNotification(payload: any): void {
        const inner = typeof payload?.data === 'object' && payload.data !== null ? payload.data : {};

        const typeCandidates = [inner.type, payload?.notification_type, payload?.type];
        const businessType =
            typeCandidates.find(
                (value): value is string =>
                    typeof value === 'string' && value.trim().length > 0 && !value.includes('\\')
            ) || '';

        /** Id del recurso (lote de importación, solicitud de alta manual, export, etc.). No usar `payload.id`. */
        const resourceId =
            (typeof inner.export_id === 'string' && inner.export_id) ||
            (typeof inner.request_id === 'string' && inner.request_id) ||
            (typeof payload?.request_id === 'string' && payload.request_id) ||
            (typeof inner.id === 'string' && inner.id) ||
            (typeof payload?.id_resource === 'string' && payload.id_resource) ||
            '';

        const requestId =
            (typeof inner.request_id === 'string' && inner.request_id) ||
            (typeof payload?.request_id === 'string' && payload.request_id) ||
            '';

        const exportId =
            (typeof inner.export_id === 'string' && inner.export_id) ||
            (businessType.toLowerCase().includes('process-export') && typeof inner.id === 'string' ? inner.id : '') ||
            '';

        const organizationId =
            (typeof inner.organization_id === 'string' && inner.organization_id) ||
            (typeof payload?.organization_id === 'string' && payload.organization_id) ||
            '';

        const downloadable =
            typeof inner.downloadable === 'boolean'
                ? inner.downloadable
                : typeof payload?.downloadable === 'boolean'
                  ? payload.downloadable
                  : undefined;

        const downloadUrl =
            (typeof inner.download_url === 'string' && inner.download_url) ||
            (typeof payload?.download_url === 'string' && payload.download_url) ||
            null;

        const rowCountRaw = inner.row_count ?? payload?.row_count;
        const rowCount = typeof rowCountRaw === 'number' ? rowCountRaw : undefined;
        const actionRowCountRaw = inner.action_row_count ?? payload?.action_row_count;
        const actionRowCount = typeof actionRowCountRaw === 'number' ? actionRowCountRaw : undefined;

        const newNotification: AppNotification = {
            id: String(payload?.id ?? ''),
            type: typeof payload?.type === 'string' ? payload.type : 'BroadcastNotificationCreated',
            notifiable_type: typeof payload?.notifiable_type === 'string' ? payload.notifiable_type : '',
            notifiable_id: typeof payload?.notifiable_id === 'string' ? payload.notifiable_id : '',
            data: {
                title: String(inner.title ?? payload?.title ?? ''),
                description: String(inner.description ?? payload?.description ?? ''),
                type: String(businessType),
                id: String(resourceId || exportId),
                status: String(inner.status ?? payload?.status ?? ''),
                request_id: requestId || undefined,
                export_id: exportId || undefined,
                process_number: String(inner.process_number ?? payload?.process_number ?? '') || undefined,
                organization_id: organizationId || undefined,
                organization_name:
                    String(
                        inner.organization_name ??
                            inner.organization ??
                            payload?.organization_name ??
                            payload?.organization ??
                            ''
                    ) || undefined,
                downloadable,
                download_url: downloadUrl,
                row_count: rowCount,
                action_row_count: actionRowCount,
                url: String(inner.url ?? payload?.url ?? '') || undefined,
            },
            read_at: null,
            opened_at: null,
            created_at: new Date().toISOString(),
            created_at_human: 'Justo ahora',
        };

        // Update state live
        this._notifications.update((current) => [newNotification, ...current]);
        this._unreadCount.update((count) => count + 1);
        this._newCount.update((count) => count + 1);

        const normalizedType = normalizeNotificationBusinessType(businessType);
        if (normalizedType === 'manual-registration-requested') {
            this._manualRegistrationService.refreshPendingCount();
            this._manualRegistrationService.notifyQueueUpdated();
        }
        if (normalizedType === 'process-export-finished') {
            this._processExportService.notifyHistoryUpdated();
        }
    }
}
