import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from '@app/core/auth/auth.service';
import { WebsocketService } from '@app/core/services/websocket/websocket.service';
import { NotificationService } from '@app/core/services/notification/notification.service';
import { ProcessExportService } from '@app/core/services/process/process-export.service';
import {
  normalizeNotificationBusinessType,
  resolveAdminNotificationNavigation,
} from '@app/core/constants/notification-navigation.constant';
import { AppNotification } from '@app/core/models/notification/notification.model';

interface Toast {
  id: string;
  title: string;
  message: string;
  downloadable?: boolean;
  organizationId?: string;
  exportId?: string;
  historyCommands?: string[];
  historyQueryParams?: Record<string, string>;
  downloading?: boolean;
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
        <div
          class="alert bg-base-100 border-l-4 border-base-content shadow-xl rounded-lg grid-cols-[auto_1fr_auto] w-80 mb-2 animate-slide-in"
        >
          <!-- Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-base-content shrink-0 w-6 h-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>

          <!-- Content -->
          <div class="flex flex-col gap-2 w-full overflow-hidden">
            <h3 class="font-bold text-sm text-base-content truncate">{{ toast.title }}</h3>
            <div class="text-xs text-base-content/70 line-clamp-2" [title]="toast.message">{{ toast.message }}</div>
            @if (toast.downloadable || toast.historyCommands) {
              <div class="flex flex-wrap gap-1.5 mt-0.5">
                @if (toast.downloadable && toast.organizationId && toast.exportId) {
                  <button
                    type="button"
                    class="btn btn-xs btn-primary"
                    [disabled]="toast.downloading"
                    (click)="onToastDownload(toast)"
                  >
                    @if (toast.downloading) {
                      <span class="loading loading-spinner loading-xs"></span>
                    } @else {
                      {{ downloadLabel }}
                    }
                  </button>
                }
                @if (toast.historyCommands) {
                  <button type="button" class="btn btn-xs btn-ghost" (click)="onToastNavigate(toast)">
                    {{ historyLabel }}
                  </button>
                }
              </div>
            }
          </div>

          <!-- Close button -->
          <button class="btn btn-xs btn-ghost btn-circle" (click)="removeToast(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .animate-slide-in {
        animation: slideIn 0.3s ease-out forwards;
      }
      @keyframes slideIn {
        0% {
          transform: translateX(100%);
          opacity: 0;
        }
        100% {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  private _authService = inject(AuthService);
  private _websocketService = inject(WebsocketService);
  private _notificationService = inject(NotificationService);
  private _processExportService = inject(ProcessExportService);
  private _router = inject(Router);
  private _transloco = inject(TranslocoService);

  private _channels: string[] = [];
  public toasts = signal<Toast[]>([]);

  public get downloadLabel(): string {
    return this._transloco.translate('historialExportaciones.actions.download');
  }

  public get historyLabel(): string {
    return this._transloco.translate('historialExportaciones.actions.viewHistory');
  }

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

  private _loadInitialData(): void {
    this._notificationService.getUnreadCount().subscribe();
  }

  private _subscribeToChannels(user: any): void {
    this._unsubscribeFromChannels();

    const userId = user.id;

    if (userId) {
      const userChannel = `Src.Domain.User.Models.User.${userId}`;
      console.log(`Subscribing to admin notification channel: ${userChannel}`);

      this._websocketService.listenPrivate(
        userChannel,
        '.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated',
        (data: any) => {
          console.log('Nueva notificación recibida por WS:', data);
          this._notificationService.handleIncomingNotification(data);
          const inner = typeof data?.data === 'object' && data.data !== null ? data.data : {};
          const title = inner.title || data.title || 'Nueva Notificación';
          const description = inner.description || data.description || 'Tienes una nueva actualización.';

          const businessType = normalizeNotificationBusinessType(
            String(inner.type ?? data?.notification_type ?? data?.type ?? '')
          );

          if (businessType === 'process-export-finished') {
            const synthetic: AppNotification = {
              id: String(data?.id ?? ''),
              type: typeof data?.type === 'string' ? data.type : '',
              notifiable_type: '',
              notifiable_id: '',
              data: {
                title: String(title),
                description: String(description),
                type: businessType,
                id: String(inner.export_id ?? inner.id ?? ''),
                status: String(inner.status ?? ''),
                export_id: String(inner.export_id ?? inner.id ?? '') || undefined,
                organization_id: String(inner.organization_id ?? '') || undefined,
                organization_name: String(inner.organization_name ?? '') || undefined,
                downloadable: !!inner.downloadable,
                download_url: inner.download_url ?? null,
                url: String(inner.url ?? '') || undefined,
              },
              read_at: null,
              created_at: new Date().toISOString(),
            };
            const nav = resolveAdminNotificationNavigation(synthetic);
            this.showToast(title, description, {
              downloadable: !!inner.downloadable,
              organizationId: String(inner.organization_id ?? '') || undefined,
              exportId: String(inner.export_id ?? inner.id ?? '') || undefined,
              historyCommands: nav?.commands,
              historyQueryParams: nav?.queryParams,
            });
            return;
          }

          this.showToast(title, description);
        }
      );

      this._channels.push(userChannel);
    }
  }

  private _unsubscribeFromChannels(): void {
    if (this._channels.length > 0) {
      this._channels.forEach((channel) => {
        console.log(`Leaving channel: ${channel}`);
        this._websocketService.leave(channel);
      });
      this._channels = [];
    }
  }

  showToast(
    title: string,
    message: string,
    extras?: Partial<Pick<Toast, 'downloadable' | 'organizationId' | 'exportId' | 'historyCommands' | 'historyQueryParams'>>
  ): void {
    const toastId = Math.random().toString(36).substring(2, 9);
    this.toasts.update((toasts) => [
      ...toasts,
      {
        id: toastId,
        title,
        message,
        ...extras,
      },
    ]);

    setTimeout(() => {
      this.removeToast(toastId);
    }, extras?.downloadable ? 12000 : 5000);
  }

  removeToast(id: string): void {
    this.toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  onToastDownload(toast: Toast): void {
    if (!toast.organizationId || !toast.exportId || toast.downloading) return;

    this.toasts.update((list) =>
      list.map((t) => (t.id === toast.id ? { ...t, downloading: true } : t))
    );

    this._processExportService
      .downloadAndSave({
        organization_id: toast.organizationId,
        id: toast.exportId,
        file_name: null,
      })
      .subscribe({
        next: () => {
          this.toasts.update((list) =>
            list.map((t) => (t.id === toast.id ? { ...t, downloading: false } : t))
          );
        },
        error: () => {
          this.toasts.update((list) =>
            list.map((t) => (t.id === toast.id ? { ...t, downloading: false } : t)
            )
          );
        },
      });
  }

  onToastNavigate(toast: Toast): void {
    if (!toast.historyCommands?.length) return;
    void this._router.navigate(toast.historyCommands, {
      queryParams: toast.historyQueryParams,
    });
    this.removeToast(toast.id);
  }
}
