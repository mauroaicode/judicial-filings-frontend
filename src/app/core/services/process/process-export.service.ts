import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  GlobalProcessExportHistoryQuery,
  OrganizationProcessExportHistoryQuery,
  ProcessExportDetailResponse,
  ProcessExportEnqueueResponse,
  ProcessExportFilters,
  ProcessExportHistoryResponse,
  ProcessExportItem,
} from '@app/core/models/process/process-export.model';

@Injectable({
  providedIn: 'root',
})
export class ProcessExportService {
  private _http = inject(HttpClient);

  /** Sube cuando llega ProcessExportFinished por WS; el historial se recarga. */
  public readonly historyRevision = signal(0);

  notifyHistoryUpdated(): void {
    this.historyRevision.update((n) => n + 1);
  }

  enqueue(organizationId: string, filters: ProcessExportFilters = {}): Observable<ProcessExportEnqueueResponse> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/processes/export`;
    return this._http.post<ProcessExportEnqueueResponse>(url, filters);
  }

  getExport(organizationId: string, exportId: string): Observable<ProcessExportDetailResponse> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/processes/exports/${exportId}`;
    return this._http.get<ProcessExportDetailResponse>(url);
  }

  getOrganizationHistory(
    organizationId: string,
    query: OrganizationProcessExportHistoryQuery = {}
  ): Observable<ProcessExportHistoryResponse> {
    const params = this._buildHistoryParams(query);
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/processes/exports`;
    return this._http.get<ProcessExportHistoryResponse>(url, { params });
  }

  getGlobalHistory(query: GlobalProcessExportHistoryQuery = {}): Observable<ProcessExportHistoryResponse> {
    let params = this._buildHistoryParams(query);

    const organization = query.organization?.trim();
    if (organization) {
      params = params.set('organization', organization);
    }

    const organizationId = query.organization_id?.trim();
    if (organizationId) {
      params = params.set('organization_id', organizationId);
    }

    const url = `${environment.apiBaseUrl}/processes/export-history`;
    return this._http.get<ProcessExportHistoryResponse>(url, { params });
  }

  rerun(organizationId: string, exportId: string): Observable<ProcessExportEnqueueResponse> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/processes/exports/${exportId}/rerun`;
    return this._http.post<ProcessExportEnqueueResponse>(url, {});
  }

  /**
   * Descarga autenticada (Bearer vía interceptor). No abrir en pestaña anónima.
   */
  downloadBlob(organizationId: string, exportId: string): Observable<Blob> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/processes/exports/${exportId}/download`;
    return this._http.get(url, { responseType: 'blob' });
  }

  /**
   * Guarda el Excel en el disco del usuario a partir de un export descargable.
   */
  downloadAndSave(item: Pick<ProcessExportItem, 'organization_id' | 'id' | 'file_name'>): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.downloadBlob(item.organization_id, item.id).subscribe({
        next: (blob) => {
          const fileName = item.file_name?.trim() || `procesos-export-${item.id}.xlsx`;
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = fileName;
          anchor.rel = 'noopener';
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(objectUrl);
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  private _buildHistoryParams(query: OrganizationProcessExportHistoryQuery): HttpParams {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 15;
    let params = new HttpParams().set('page', String(page)).set('per_page', String(perPage));

    const status = query.status?.trim();
    if (status) {
      params = params.set('status', status);
    }

    const from = query.created_at_from?.trim();
    if (from) {
      params = params.set('created_at_from', from);
    }

    const to = query.created_at_to?.trim();
    if (to) {
      params = params.set('created_at_to', to);
    }

    return params;
  }
}
