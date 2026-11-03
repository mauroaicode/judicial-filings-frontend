import { Injectable, signal } from '@angular/core';

export interface ProcessDetailHeaderContext {
  processNumber: string;
  statusLabel: string;
  statusBadgeClass: string;
  isManualSync?: boolean;
  lastActivityDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class PageHeaderContextService {
  private _compactVisible = signal(false);
  private _processDetailContext = signal<ProcessDetailHeaderContext | null>(null);

  readonly compactVisible = this._compactVisible.asReadonly();
  readonly processDetailContext = this._processDetailContext.asReadonly();

  setProcessDetailContext(context: ProcessDetailHeaderContext | null): void {
    this._processDetailContext.set(context);
  }

  setCompactVisible(visible: boolean): void {
    this._compactVisible.set(visible);
  }

  clearProcessDetail(): void {
    this._compactVisible.set(false);
    this._processDetailContext.set(null);
  }
}
