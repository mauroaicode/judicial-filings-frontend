import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  NotificationDigestDetailResponse,
  NotificationDigestFilter,
  NotificationDigestListQuery,
  NotificationDigestListResponse,
  NotificationDigestViewsResponse,
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
   * GET /api/admin/notification-digests
   * Listado de consolidados. No marca vistos.
   * is_viewed=1 solo los abiertos; is_viewed=0 solo los que nadie ha visto.
   */
  list(query: NotificationDigestListQuery = {}): Observable<NotificationDigestListResponse> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    let params = new HttpParams().set('page', String(page)).set('per_page', String(perPage));

    const filters: [keyof NotificationDigestListQuery, string | undefined][] = [
      ['organization_id', query.organization_id],
      ['process_number', query.process_number],
      ['is_viewed', query.is_viewed],
      ['registration_date_from', query.registration_date_from],
      ['registration_date_to', query.registration_date_to],
      ['action_date_from', query.action_date_from],
      ['action_date_to', query.action_date_to],
      ['created_at_from', query.created_at_from],
      ['created_at_to', query.created_at_to],
      ['term_start_date_from', query.term_start_date_from],
      ['term_start_date_to', query.term_start_date_to],
      ['term_end_date_from', query.term_end_date_from],
      ['term_end_date_to', query.term_end_date_to],
    ];

    for (const [key, value] of filters) {
      const trimmed = value?.trim();
      if (trimmed) params = params.set(key, trimmed);
    }

    return this._http.get<NotificationDigestListResponse>(
      `${environment.apiBaseUrl}/notification-digests`,
      { params },
    );
  }

  /**
   * GET /api/admin/notification-digests/{digestId}/views
   * Quién abrió el consolidado. No marca vistos y no es el detalle de actuaciones.
   */
  getViews(digestId: string): Observable<NotificationDigestViewsResponse> {
    const url = `${environment.apiBaseUrl}/notification-digests/${digestId}/views`;
    return this._http.get<NotificationDigestViewsResponse>(url);
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

  /**
   * PDF de un consolidado ya enviado. No aplica al pendiente.
   * Sin organización: GET /notification-digests/{id}/export-pdf
   * Con organización: GET /organizations/{organization}/notification-digests/{digest}/export-pdf
   */
  exportPdf(digestId: string, organizationId?: string | null): Observable<HttpResponse<Blob>> {
    const id = digestId.trim();
    const orgId = organizationId?.trim();
    const url = orgId
      ? `${this.orgBase(orgId)}/${id}/export-pdf`
      : `${environment.apiBaseUrl}/notification-digests/${id}/export-pdf`;
    return this._http.get(url, {
      responseType: 'blob',
      observe: 'response',
      headers: new HttpHeaders({ Accept: 'application/pdf' }),
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

/** Guarda el PDF usando el nombre de Content-Disposition. */
export function saveDigestPdfFile(response: HttpResponse<Blob>, fallbackId: string): boolean {
  const blob = response.body;
  if (!blob || blob.size === 0 || blob.type.includes('application/json')) return false;

  const filename =
    filenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    `consolidado-${fallbackId}.pdf`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    const raw = utf8Match[1].trim().replace(/^["']|["']$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch?.[1]?.trim() || null;
}
