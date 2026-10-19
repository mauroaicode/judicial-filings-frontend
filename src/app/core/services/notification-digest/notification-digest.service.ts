import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  NotificationDigestDetailResponse,
  NotificationDigestFilter,
} from '@app/core/models/notification-digest/notification-digest.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationDigestService {
  private _http = inject(HttpClient);

  private orgBase(organizationId: string): string {
    return `${environment.apiBaseUrl}/organizations/${organizationId}/notification-digests`;
  }

  /**
   * GET /api/admin/organizations/{organizationId}/notification-digests/pending
   * Detalle de lectura del consolidado aún no persistido.
   */
  getPending(
    organizationId: string,
    page: number = 1,
    perPage: number = 20,
    filters?: NotificationDigestFilter,
  ): Observable<NotificationDigestDetailResponse> {
    const url = `${this.orgBase(organizationId)}/pending`;
    return this._http.get<NotificationDigestDetailResponse>(url, {
      params: this.buildParams(page, perPage, filters),
    });
  }

  /**
   * GET /api/admin/organizations/{organizationId}/notification-digests/{digestId}
   * Detalle de un consolidado ya persistido.
   */
  getById(
    organizationId: string,
    digestId: string,
    page: number = 1,
    perPage: number = 20,
    filters?: NotificationDigestFilter,
  ): Observable<NotificationDigestDetailResponse> {
    const url = `${this.orgBase(organizationId)}/${digestId}`;
    return this._http.get<NotificationDigestDetailResponse>(url, {
      params: this.buildParams(page, perPage, filters),
    });
  }

  private buildParams(
    page: number,
    perPage: number,
    filters?: NotificationDigestFilter,
  ): HttpParams {
    let params = new HttpParams()
      .set('page', String(page))
      .set('per_page', String(perPage));

    if (!filters) return params;

    const entries: [keyof NotificationDigestFilter, string | undefined][] = [
      ['process_number', filters.process_number],
      ['registration_date_from', filters.registration_date_from],
      ['registration_date_to', filters.registration_date_to],
      ['action_date_from', filters.action_date_from],
      ['action_date_to', filters.action_date_to],
      ['term_start_date_from', filters.term_start_date_from],
      ['term_start_date_to', filters.term_start_date_to],
      ['term_end_date_from', filters.term_end_date_from],
      ['term_end_date_to', filters.term_end_date_to],
    ];

    for (const [key, value] of entries) {
      if (value) params = params.set(key, value);
    }

    return params;
  }
}
