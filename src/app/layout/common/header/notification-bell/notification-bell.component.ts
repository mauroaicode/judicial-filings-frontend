import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { NotificationService } from '@app/core/services/notification/notification.service';
import { AppNotification } from '@app/core/models/notification/notification.model';

@Component({
    selector: 'app-notification-bell',
    standalone: true,
    imports: [CommonModule, TranslocoModule],
    templateUrl: './notification-bell.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent implements OnInit {
    private _notificationService = inject(NotificationService);
    private _router = inject(Router);

    public unreadCount = this._notificationService.unreadCount;
    public notifications = this._notificationService.notifications;

    ngOnInit(): void {
        this._notificationService.getNotifications(1).subscribe();
    }

    /**
     * Load notifications when dropdown is opened (refresh)
     */
    onDropdownOpen(): void {
        this._notificationService.getNotifications(1).subscribe();
    }

    /**
     * Mark as read and navigate
     */
    onNotificationClick(notification: AppNotification): void {
        // 1. Mark as read in API
        if (!notification.read_at) {
            this._notificationService.markAsRead(notification.id).subscribe();
        }

        // 2. Navigate based on type
        const data = notification.data;
        if (data.type === 'import-report') {
            this._router.navigate(['/admin/import-batches', data.id]);
        }
        // Add more types here as needed
    }

    /**
     * Format date for display
     */
    formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleString();
    }
}
