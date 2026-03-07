import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/auth/auth.service';
import { WebsocketService } from '@app/core/services/websocket/websocket.service';
import { NotificationService } from '@app/core/services/notification/notification.service';

interface Toast {
    id: string;
    title: string;
    message: string;
}

/**
 * Component to handle real-time notifications via WebSockets.
 */
@Component({
    selector: 'app-notifications',
    standalone: true,
    imports: [CommonModule],
    template: `
        <!-- Toast Container -->
        <div class="toast toast-bottom toast-end z-[9999] p-4">
            @for (toast of toasts(); track toast.id) {
                <div class="alert bg-base-100 border-l-4 border-base-content shadow-xl rounded-lg grid-cols-[auto_1fr_auto] w-80 mb-2 animate-slide-in">
                    <!-- Icon -->
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-base-content shrink-0 w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    
                    <!-- Content -->
                    <div class="flex flex-col gap-1 w-full overflow-hidden">
                        <h3 class="font-bold text-sm text-base-content truncate">{{ toast.title }}</h3>
                        <div class="text-xs text-base-content/70 line-clamp-2" [title]="toast.message">{{ toast.message }}</div>
                    </div>
                    
                    <!-- Close button -->
                    <button class="btn btn-xs btn-ghost btn-circle" (click)="removeToast(toast.id)">
                        ✕
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        .animate-slide-in {
            animation: slideIn 0.3s ease-out forwards;
        }
        @keyframes slideIn {
            0% { transform: translateX(100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
        }
    `]
})
export class NotificationsComponent implements OnInit, OnDestroy {
    private _authService = inject(AuthService);
    private _websocketService = inject(WebsocketService);
    private _notificationService = inject(NotificationService);

    private _channels: string[] = [];
    public toasts = signal<Toast[]>([]);

    constructor() {
        effect(() => {
            const user = this._authService.user();
            if (user) {
                this._websocketService.refreshConnection();
                this._subscribeToChannels(user);
                this._loadInitialData();
            } else {
                this._unsubscribeFromChannels();
                this._websocketService.disconnect();
            }
        });
    }

    ngOnInit(): void {
        const user = this._authService.currentUser;
        if (user) {
            this._subscribeToChannels(user);
            this._loadInitialData();
        }
    }

    ngOnDestroy(): void {
        this._unsubscribeFromChannels();
    }

    /**
     * Load initial unread count
     */
    private _loadInitialData(): void {
        this._notificationService.getUnreadCount().subscribe();
    }

    /**
     * Subscribe to relevant private channels
     *
     * @param user The current authenticated user
     */
    private _subscribeToChannels(user: any): void {
        this._unsubscribeFromChannels();

        const userId = user.id;

        // Admin Notification Channel: Src.Domain.User.Models.User.{user_id}
        if (userId) {
            const userChannel = `Src.Domain.User.Models.User.${userId}`;
            console.log(`Subscribing to admin notification channel: ${userChannel}`);

            // Listen for Laravel Broadcast Notifications
            this._websocketService.listenPrivate(
                userChannel,
                '.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated',
                (data: any) => {
                    console.log('Nueva notificación recibida por WS:', data);
                    this._notificationService.handleIncomingNotification(data);
                    this.showToast(data.title || 'Nueva Notificación', data.description || 'Tienes una nueva actualización.');
                }
            );

            this._channels.push(userChannel);
        }
    }

    /**
     * Unsubscribe from all active channels
     */
    private _unsubscribeFromChannels(): void {
        if (this._channels.length > 0) {
            this._channels.forEach(channel => {
                console.log(`Leaving channel: ${channel}`);
                this._websocketService.leave(channel);
            });
            this._channels = [];
        }
    }

    /**
     * Show a toast notification and auto-remove it after 5 seconds
     */
    showToast(title: string, message: string): void {
        const toastId = Math.random().toString(36).substring(2, 9);
        this.toasts.update(toasts => [...toasts, { id: toastId, title, message }]);

        setTimeout(() => {
            this.removeToast(toastId);
        }, 5000);
    }

    /**
     * Remove a toast by id
     */
    removeToast(id: string): void {
        this.toasts.update(toasts => toasts.filter(t => t.id !== id));
    }
}
