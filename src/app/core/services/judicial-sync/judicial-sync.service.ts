import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  JudicialSyncDispatchRequest,
  JudicialSyncDispatchResponse,
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
    };
    return this._http.post<JudicialSyncDispatchResponse>(this._baseUrl(), body);
  }

  getRuns(page: number = 1, perPage: number = 15): Observable<JudicialSyncRunsResponse> {
    let params = new HttpParams().set('page', String(page)).set('per_page', String(perPage));
    const url = `${this._baseUrl()}/runs`;
    return this._http.get<JudicialSyncRunsResponse>(url, { params });
  }
}
