/**
 * Notification data payload (the "data" property inside the database notification)
 */
export interface NotificationData {
    title: string;
    description: string;
    type: string; // e.g., 'import-report'
    id: string;   // Recource related ID (like batch import UUID)
    status: string;
}

/**
 * Main Notification Model (Laravel structure)
 */
export interface AppNotification {
    id: string; // Database notification UUID
    type: string;
    notifiable_type: string;
    notifiable_id: string;
    data: NotificationData;
    read_at: string | null;
    created_at: string;
    created_at_human?: string;
}

/**
 * Paginated notification response from API
 */
export interface NotificationResponse {
    current_page: number;
    data: AppNotification[];
    total: number;
}

/**
 * Unread count response
 */
export interface UnreadCountResponse {
    unread_count: number;
}
