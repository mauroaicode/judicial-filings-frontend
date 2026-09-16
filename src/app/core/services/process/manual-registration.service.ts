import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import { ProcessService } from '@app/core/services/process/process.service';
import {
  ManualRegistrationFilter,
  ManualRegistrationListResponse,
  RegisterManualRegistrationPayload,
  RegisterManualRegistrationResponse,
  ResolveManualRegistrationPayload,
  ResolveManualRegistrationResponse,
} from '@app/core/models/process/manual-registration-request.model';

@Injectable({
  providedIn: 'root',
})
export class ManualRegistrationService {
  private _http = inject(HttpClient);
  private _processService = inject(ProcessService);

  /** Badge del menú: pendientes de digitación. */
  public readonly pendingCount = signal(0);
  /** Sube cuando llega una solicitud por WebSocket; la cola se recarga. */
  public readonly queueRevision = signal(0);

  list(filters: ManualRegistrationFilter = {}): Observable<ManualRegistrationListResponse> {
    let params = new HttpParams();

    if (filters.page) {
      params = params.set('page', String(filters.page));
    }
    if (filters.per_page) {
      params = params.set('per_page', String(filters.per_page));
    }
    params = params.set('status', filters.status || 'pending');
    if (filters.reason) {
      params = params.set('reason', filters.reason);
    }
    const organization = filters.organization?.trim();
    if (organization) {
      params = params.set('organization', organization);
    }
    const processNumber = filters.process_number?.trim();
    if (processNumber) {
      params = params.set('process_number', processNumber);
    }

    const url = `${environment.apiBaseUrl}/processes/manual-registration-requests`;
    return this._http.get<ManualRegistrationListResponse>(url, { params });
  }

  register(
    id: string,
    payload: RegisterManualRegistrationPayload
  ): Observable<RegisterManualRegistrationResponse> {
    const url = `${environment.apiBaseUrl}/processes/manual-registration-requests/${id}/register`;
    return this._http.post<RegisterManualRegistrationResponse>(url, payload).pipe(
      tap(() => this.refreshPendingCount())
    );
  }

  resolve(
    id: string,
    payload: ResolveManualRegistrationPayload
  ): Observable<ResolveManualRegistrationResponse> {
    const url = `${environment.apiBaseUrl}/processes/manual-registration-requests/${id}`;
    return this._http.patch<ResolveManualRegistrationResponse>(url, payload).pipe(
      tap(() => this.refreshPendingCount())
    );
  }

  refreshPendingCount(): void {
    this._processService.getDashboardStats().subscribe({
      next: (stats) => {
        this.pendingCount.set(stats.pending_manual_registrations ?? 0);
      },
      error: () => {
        /* el badge se queda con el último valor conocido */
      },
    });
  }

  setPendingCount(count: number | null | undefined): void {
    if (typeof count === 'number' && count >= 0) {
      this.pendingCount.set(count);
    }
  }

  notifyQueueUpdated(): void {
    this.queueRevision.update((n) => n + 1);
  }
}
