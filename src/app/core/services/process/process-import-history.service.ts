import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import {
  ProcessImportHistoryQuery,
  ProcessImportHistoryResponse,
} from '@app/core/models/process/process-import-history.model';

@Injectable({
  providedIn: 'root',
})
export class ProcessImportHistoryService {
  private _http = inject(HttpClient);

  getHistory(query: ProcessImportHistoryQuery = {}): Observable<ProcessImportHistoryResponse> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 15;

    let params = new HttpParams().set('page', String(page)).set('per_page', String(perPage));

    const org = query.organization?.trim();
    if (org) params = params.set('organization', org);

    const fileName = query.file_name?.trim();
    if (fileName) params = params.set('file_name', fileName);

    const status = query.status?.trim();
    if (status) params = params.set('status', status);

    if (query.has_errors === true) {
      params = params.set('has_errors', '1');
    }
    if (query.has_errors === false) {
      params = params.set('has_errors', '0');
    }

    const from = query.created_at_from?.trim();
    if (from) params = params.set('created_at_from', from);

    const to = query.created_at_to?.trim();
    if (to) params = params.set('created_at_to', to);

    const url = `${environment.apiBaseUrl}/processes/import-history`;
    return this._http.get<ProcessImportHistoryResponse>(url, { params });
  }
}
