import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { BodyPortalDirective } from '@app/shared/directives/body-portal.directive';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  FilterSelectComponent,
  FilterSelectOption,
} from '@app/shared/components/filter-select/filter-select.component';
import { buildPerPageSelectOptions } from '@app/shared/utils/filter-select-options.util';

/**
 * Item inside a column `action: 'menu'` (⋯).
 */
export interface DataTableRowMenuItem {
  /** Emitted as `actionClick.key` */
  key: string;
  label: string;
  visible?: (row: Record<string, unknown>) => boolean;
  itemClass?: string;
}

/**
 * Column definition for data table
 */
export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  maxWidth?: string;
  align?: 'left' | 'center' | 'right';
  /** When true, treat rendered value as safe-ish HTML (Angular sanitizes). */
  html?: boolean;
  /** Keep the cell on one line (dates, index, actions). */
  nowrap?: boolean;
  render?: (value: any, row: any) => string;
  /**
   * Renders an icon button; clicks emit `actionClick` and do not trigger `rowClick`.
   * `menu` shows ⋯ with `menuItems`.
   */
  action?: 'edit' | 'documents' | 'mark_removed' | 'menu';
  menuItems?: DataTableRowMenuItem[];
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
  imports: [CommonModule, TranslocoPipe, FormsModule, FilterSelectComponent, BodyPortalDirective],
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent {
  private _transloco = inject(TranslocoService);
  /** Evita que el mismo click de apertura cierre el menú vía document:click. */
  private _ignoreDocumentCloseUntil = 0;

  // Inputs
  public columns = input.required<DataTableColumn[]>();
  public data = input.required<any[]>();
  public pagination = input<PaginationInfo | null>(null);
  public loading = input<boolean>(false);
  public emptyMessage = input<string>('No hay datos disponibles');
  /** Optional extra classes per row (e.g. atenuar actuaciones retiradas en Rama). */
  public rowClass = input<(row: Record<string, unknown>) => string | null>(() => null);

  /** Fila cuyo menú ⋯ está abierto (solo uno a la vez). */
  public openMenuRowId = signal<string | null>(null);
  public openMenuRow = signal<Record<string, unknown> | null>(null);
  public openMenuItems = signal<DataTableRowMenuItem[]>([]);
  public menuAnchor = signal<{ top: number; left: number; minWidth: number } | null>(null);

  // Outputs
  public pageChange = output<{ page: number; perPage: number }>();
  public rowClick = output<any>();
  public actionClick = output<{ key: string; row: any }>();

  // Page size options
  public pageSizeOptions = [10, 20, 25, 50, 100];

  get perPageSelectOptions(): FilterSelectOption[] {
    return buildPerPageSelectOptions(this.pageSizeOptions, this._transloco.translate('table.perPage'));
  }

  /**
   * Handle page change
   */
  onPageChange(page: number, perPage: number): void {
    this.closeRowMenu();
    this.pageChange.emit({ page, perPage });
  }

  /**
   * Handle row click
   */
  onRowClick(row: any): void {
    this.closeRowMenu();
    this.rowClick.emit(row);
  }

  /**
   * Handle column action button click
   */
  onActionClick(event: Event, key: string, row: any): void {
    event.preventDefault();
    event.stopPropagation();
    this.actionClick.emit({ key, row });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.openMenuRowId()) {
      return;
    }
    if (performance.now() < this._ignoreDocumentCloseUntil) {
      return;
    }
    const target = ev.target;
    if (target instanceof Element && (target.closest('.data-table-menu-portal') || target.closest('.data-table-menu-trigger'))) {
      return;
    }
    this.closeRowMenu();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    this.closeRowMenu();
  }

  onTableScroll(): void {
    if (this.openMenuRowId()) {
      this.closeRowMenu();
    }
  }

  closeRowMenu(): void {
    this.openMenuRowId.set(null);
    this.openMenuRow.set(null);
    this.openMenuItems.set([]);
    this.menuAnchor.set(null);
  }

  toggleRowMenu(event: Event, row: { id?: string }, column: DataTableColumn): void {
    event.preventDefault();
    event.stopPropagation();
    const rowId = row?.id ?? null;
    if (!rowId || !column.menuItems?.length) return;

    if (this.openMenuRowId() === rowId) {
      this.closeRowMenu();
      return;
    }

    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 240;
    const itemCount = this.countVisibleMenuItems(column.menuItems, row as Record<string, unknown>);
    const menuHeight = Math.min(itemCount * 44 + 12, window.innerHeight * 0.7);

    let openUp = this.shouldOpenMenuUp(row);
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < menuHeight + 8) {
      openUp = true;
    }

    let top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;
    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

    this._ignoreDocumentCloseUntil = performance.now() + 250;
    this.openMenuRowId.set(rowId);
    this.openMenuRow.set(row as Record<string, unknown>);
    this.openMenuItems.set(column.menuItems);
    this.menuAnchor.set({ top, left, minWidth: menuWidth });
  }

  columnMinWidth(column: DataTableColumn): string | null {
    if (column.key === 'process_number') {
      return null;
    }
    return column.width ?? null;
  }

  columnMaxWidth(column: DataTableColumn): string | null {
    if (column.key === 'process_number') {
      return null;
    }
    return column.maxWidth ?? null;
  }

  /** Ancho mínimo de la tabla (suma de columnas). Si el contenedor es más ancho, la tabla se estira. */
  tableWidth(): string {
    const total = this.columns().reduce((sum, col) => {
      if (col.key === 'process_number') {
        return sum + 240;
      }
      const parsed = Number.parseInt(col.width ?? '', 10);
      return sum + (Number.isFinite(parsed) ? parsed : 160);
    }, 0);
    return `${total}px`;
  }

  columnColWidth(column: DataTableColumn): string {
    if (column.key === 'process_number') {
      return '240px';
    }
    return column.width ?? '160px';
  }

  countVisibleMenuItems(items: DataTableRowMenuItem[], row: Record<string, unknown>): number {
    return items.filter((item) => this.isMenuItemVisible(item, row)).length;
  }

  isRowMenuOpen(row: { id?: string }): boolean {
    const rowId = row?.id ?? null;
    return !!rowId && this.openMenuRowId() === rowId;
  }

  isMenuItemVisible(item: DataTableRowMenuItem, row: Record<string, unknown>): boolean {
    return item.visible ? item.visible(row) : true;
  }

  onMenuItemClick(event: Event, key: string, row: any): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeRowMenu();
    this.actionClick.emit({ key, row });
  }

  documentCount(row: Record<string, unknown>): number {
    const docs = row['documents'];
    return Array.isArray(docs) ? docs.length : 0;
  }

  /** Evita que el menú quede recortado al final de tablas cortas o en las últimas filas. */
  shouldOpenMenuUp(row: { id?: string }): boolean {
    const data = this.data();
    const idx = data.findIndex((item) => item?.id === row?.id);
    if (idx < 0) return false;
    // Las primeras filas abren hacia abajo para no quedar bajo el thead sticky.
    if (idx <= 1) return false;
    return idx >= Math.max(2, data.length - 3);
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
    return 'position: -webkit-sticky !important; position: sticky !important; left: 0 !important; z-index: 1000 !important; background-color: #4B2A7D !important; background: #4B2A7D !important; color: #ffffff !important; min-width: 240px !important; max-width: 240px !important; width: 240px !important; box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1) !important; will-change: transform !important;';
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
