import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import { AppNotification, NotificationResponse, UnreadCountResponse } from '@app/core/models/notification/notification.model';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private _httpClient = inject(HttpClient);

    // State
    private _notifications = signal<AppNotification[]>([]);
    private _unreadCount = signal<number>(0);

    public readonly notifications = this._notifications.asReadonly();
    public readonly unreadCount = this._unreadCount.asReadonly();

    /**
     * Fetch unread count from API
     */
    getUnreadCount(): Observable<UnreadCountResponse> {
        const url = `${environment.apiBaseUrl}/notifications/unread-count`;
        return this._httpClient.get<UnreadCountResponse>(url).pipe(
            tap(res => this._unreadCount.set(res.unread_count))
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
        const newNotification: AppNotification = {
            id: payload.id, // Notification DB ID
            type: payload.type || 'BroadcastNotificationCreated',
            notifiable_type: '',
            notifiable_id: '',
            data: {
                title: payload.title,
                description: payload.description,
                type: payload.type,
                id: payload.id_resource || payload.id, // Adjust if needed
                status: payload.status
            },
            read_at: null,
            created_at: new Date().toISOString(),
            created_at_human: 'Justo ahora'
        };

        // Update state live
        this._notifications.update(current => [newNotification, ...current]);
        this._unreadCount.update(count => count + 1);
    }
}
