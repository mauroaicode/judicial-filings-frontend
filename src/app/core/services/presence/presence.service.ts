import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  DailyPresenceQuery,
  DailyPresenceResponse,
  OnlinePresenceResponse,
  OrganizationPresenceQuery,
  OrganizationPresenceResponse,
  PresenceSummaryQuery,
  PresenceSummaryResponse,
} from '@app/core/models/presence/presence.model';

@Injectable({
  providedIn: 'root',
})
export class PresenceService {
  private _http = inject(HttpClient);

  private _url(path: string): string {
    return `${environment.apiBaseUrl}/presence/${path}`;
  }

  /**
   * Quién está conectado ahora.
   * `presence_available: false` significa que Reverb no contestó: no es una lista vacía.
   */
  getOnline(organizationId?: string): Observable<OnlinePresenceResponse> {
    let params = new HttpParams();
    const organization = organizationId?.trim();
    if (organization) {
      params = params.set('organization_id', organization);
    }
    return this._http.get<OnlinePresenceResponse>(this._url('online'), { params });
  }

  /**
   * Quién entró, día a día.
   * Un día usa `date`. Un rango usa `from` y `to`. No se envían juntos.
   * La paginación llega en la raíz de la respuesta, no dentro de `meta`.
   */
  getToday(query: DailyPresenceQuery): Observable<DailyPresenceResponse> {
    const safe: DailyPresenceQuery = { ...query };
    if (safe.from || safe.to) {
      delete safe.date;
    }
    return this._http.get<DailyPresenceResponse>(this._url('today'), {
      params: this._pageParams(safe),
    });
  }

  /**
   * Resumen del periodo. Sin `from` ni `to`, el backend usa el mes en curso.
   */
  getSummary(query: PresenceSummaryQuery): Observable<PresenceSummaryResponse> {
    return this._http.get<PresenceSummaryResponse>(this._url('summary'), {
      params: this._pageParams(query),
    });
  }

  /**
   * Organizaciones que nunca entraron o superan el umbral de inactividad.
   * `is_active` omitido = solo activas; `false` envía `0`; `''` envía el parámetro vacío (activas e inactivas).
   * La paginación llega en la raíz, no dentro de `meta`.
   */
  getOrganizations(query: OrganizationPresenceQuery = {}): Observable<OrganizationPresenceResponse> {
    return this._http.get<OrganizationPresenceResponse>(this._url('organizations'), {
      params: this._organizationParams(query),
    });
  }

  private _pageParams(query: DailyPresenceQuery | PresenceSummaryQuery): HttpParams {
    let params = new HttpParams();
    const entries: Array<[string, string | number | undefined]> = [
      ['date', 'date' in query ? query.date : undefined],
      ['from', query.from],
      ['to', query.to],
      ['organization_id', query.organization_id],
      ['page', query.page],
      [
        'per_page',
        query.per_page == null ? undefined : Math.min(100, Math.max(1, query.per_page)),
      ],
    ];

    for (const [key, value] of entries) {
      if (value == null || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  private _organizationParams(query: OrganizationPresenceQuery): HttpParams {
    let params = new HttpParams();
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.inactive_days != null && Number.isFinite(query.inactive_days)) {
      const days = Math.min(365, Math.max(1, Math.trunc(query.inactive_days)));
      params = params.set('inactive_days', String(days));
    }
    if (query.page != null) {
      params = params.set('page', String(query.page));
    }
    if (query.per_page != null && Number.isFinite(query.per_page)) {
      params = params.set('per_page', String(Math.min(100, Math.max(1, Math.trunc(query.per_page)))));
    }
    const search = query.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (query.is_active === false) {
      params = params.set('is_active', '0');
    } else if (query.is_active === '') {
      params = params.set('is_active', '');
    } else if (query.is_active === true) {
      params = params.set('is_active', '1');
    }
    return params;
  }
}
