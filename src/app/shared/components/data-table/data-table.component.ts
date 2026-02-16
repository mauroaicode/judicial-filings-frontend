import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Column definition for data table
 */
export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: any) => string;
}

/**
 * Pagination info
 */
export interface PaginationInfo {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from?: number;
  to?: number;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent {
  // Inputs
  public columns = input.required<DataTableColumn[]>();
  public data = input.required<any[]>();
  public pagination = input<PaginationInfo | null>(null);
  public loading = input<boolean>(false);
  public emptyMessage = input<string>('No hay datos disponibles');

  // Outputs
  public pageChange = output<{ page: number; perPage: number }>();
  public rowClick = output<any>();

  // Page size options
  public pageSizeOptions = [10, 20, 25, 50, 100];

  /**
   * Handle page change
   */
  onPageChange(page: number, perPage: number): void {
    this.pageChange.emit({ page, perPage });
  }

  /**
   * Handle row click
   */
  onRowClick(row: any): void {
    this.rowClick.emit(row);
  }

  /**
   * Get cell value
   */
  getCellValue(row: any, column: DataTableColumn): any {
    if (column.render) {
      return column.render(row[column.key], row);
    }
    return row[column.key];
  }

  /**
   * Get pagination info
   */
  getPaginationInfo(): PaginationInfo | null {
    return this.pagination();
  }

  /**
   * Calculate page numbers for pagination
   */
  getPageNumbers(): number[] {
    const pagination = this.pagination();
    if (!pagination) return [];

    const current = pagination.current_page;
    const last = pagination.last_page;
    const pages: number[] = [];

    // Show max 5 page numbers
    let start = Math.max(1, current - 2);
    let end = Math.min(last, current + 2);

    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(last, start + 4);
      } else {
        start = Math.max(1, end - 4);
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  /**
   * Calculate showing range
   */
  getShowingRange(): { from: number; to: number } {
    const pagination = this.pagination();
    if (!pagination) return { from: 0, to: 0 };

    const from = pagination.from ?? (pagination.current_page - 1) * pagination.per_page + 1;
    const to = pagination.to ?? Math.min(pagination.current_page * pagination.per_page, pagination.total);

    return { from, to };
  }

  /**
   * Format date
   * Handles date strings in format YYYY-MM-DD or YYYY-MM-DD HH:mm:ss AM/PM without timezone conversion issues
   */
  formatDate(dateString: string): string {
    if (!dateString) return '';

    // Handle date with time format: YYYY-MM-DD HH:mm:ss AM/PM
    const dateWithAmPmMatch = dateString.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/);
    if (dateWithAmPmMatch) {
      const [, datePart, hoursStr, minutesStr, secondsStr, amPm] = dateWithAmPmMatch;
      const [year, month, day] = datePart.split('-').map(Number);
      let hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);
      
      // Convert to 24-hour format
      if (amPm === 'PM' && hours !== 12) {
        hours += 12;
      } else if (amPm === 'AM' && hours === 12) {
        hours = 0;
      }
      
      const date = new Date(year, month - 1, day, hours, minutes);
      return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Handle date with time format: YYYY-MM-DD HH:mm:ss (24-hour format)
    if (dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      const [datePart, timePart] = dateString.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      const date = new Date(year, month - 1, day, hours, minutes);
      return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Handle date only format: YYYY-MM-DD
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }

    // Fallback for other date formats
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    // Check if the date has time component
    const hasTime = dateString.includes(':');
    
    if (hasTime) {
      return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  /**
   * Get sticky header style
   */
  getStickyHeaderStyle(): string {
    return 'position: -webkit-sticky !important; position: sticky !important; left: 0 !important; z-index: 1000 !important; background-color: #161326 !important; background: #161326 !important; color: #ffffff !important; min-width: 240px !important; max-width: 240px !important; width: 240px !important; box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1) !important; will-change: transform !important;';
  }

  /**
   * Get header cell style
   */
  getHeaderCellStyle(): string {
    return '';
  }

  /**
   * Get sticky cell style
   * Note: background-color is handled by CSS to allow hover effects
   */
  getStickyCellStyle(): string {
    return 'position: -webkit-sticky !important; position: sticky !important; left: 0 !important; z-index: 500 !important; min-width: 240px !important; max-width: 240px !important; width: 240px !important; box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1) !important; white-space: nowrap !important; overflow: visible !important; will-change: transform !important;';
  }
}
