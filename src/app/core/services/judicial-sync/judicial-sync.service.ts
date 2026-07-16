import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  JudicialSyncDispatchRequest,
  JudicialSyncDispatchResponse,
  JudicialSyncRunsQuery,
  JudicialSyncRunsResponse,
} from '@app/core/models/judicial-sync/judicial-sync.model';

@Injectable({
  providedIn: 'root',
})
export class JudicialSyncService {
  private _http = inject(HttpClient);

  private _baseUrl(): string {
    return `${environment.apiBaseUrl}/judicial-sync`;
  }

  dispatchSync(payload: JudicialSyncDispatchRequest): Observable<JudicialSyncDispatchResponse> {
    const body: JudicialSyncDispatchRequest = {
      radicado: payload.radicado?.trim() ?? '',
      data_source: payload.data_source ?? 'judicial_branch',
    };
    return this._http.post<JudicialSyncDispatchResponse>(this._baseUrl(), body);
  }

  getRuns(query: JudicialSyncRunsQuery = {}): Observable<JudicialSyncRunsResponse> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('per_page', String(query.per_page ?? 15));

    if (query.data_source) {
      params = params.set('data_source', query.data_source);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.started_at_from) {
      params = params.set('started_at_from', query.started_at_from);
    }
    if (query.started_at_to) {
      params = params.set('started_at_to', query.started_at_to);
    }

    const url = `${this._baseUrl()}/runs`;
    return this._http.get<JudicialSyncRunsResponse>(url, { params });
  }
}
