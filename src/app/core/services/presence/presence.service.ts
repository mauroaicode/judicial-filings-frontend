import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  DailyPresenceQuery,
  DailyPresenceResponse,
  OnlinePresenceResponse,
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
}
