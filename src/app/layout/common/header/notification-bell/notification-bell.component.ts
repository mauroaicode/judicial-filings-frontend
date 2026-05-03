import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { resolveAdminNotificationNavigation } from '@app/core/constants/notification-navigation.constant';
import { NotificationService } from '@app/core/services/notification/notification.service';
import { AppNotification } from '@app/core/models/notification/notification.model';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent implements OnInit {
  private _notificationService = inject(NotificationService);
  private _router = inject(Router);
  private _lastOpenRequestAt = 0;

  @ViewChild('notificationBellTrigger') private _notificationBellTrigger?: ElementRef<HTMLElement>;

  public notifications = this._notificationService.notifications;
  public newCount = this._notificationService.newCount;

  public activeTab = signal<'all' | 'unread'>('all');

  public filteredNotifications = computed(() => {
    const all = this.notifications();
    if (this.activeTab() === 'unread') {
      return all.filter((n) => !n.read_at);
    }
    return all;
  });

  ngOnInit(): void {
    this._notificationService.getUnreadCount().subscribe();
    this._notificationService.getNotifications(1).subscribe();
  }

  onDropdownOpen(): void {
    const now = Date.now();
    if (now - this._lastOpenRequestAt < 300) {
      return;
    }
    this._lastOpenRequestAt = now;

    this._notificationService.markAllAsOpened().subscribe();

    this._notificationService.getNotifications(1).subscribe();
  }

  onDropdownFocus(): void {
    this.onDropdownOpen();
  }

  setTab(tab: 'all' | 'unread'): void {
    this.activeTab.set(tab);
  }

  onNotificationClick(notification: AppNotification): void {
    this._closeDropdown();

    const navigateToResolved = (): void => {
      const target = resolveAdminNotificationNavigation(notification);
      if (!target) {
        return;
      }
      this._router.navigate(target.commands, {
        queryParams: target.queryParams,
      });
    };

    if (!notification.read_at) {
      this._notificationService.markAsRead(notification.id).subscribe({
        next: () => navigateToResolved(),
        error: () => navigateToResolved(),
      });
      return;
    }

    navigateToResolved();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
  }

  private _closeDropdown(): void {
    this._notificationBellTrigger?.nativeElement.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
}
