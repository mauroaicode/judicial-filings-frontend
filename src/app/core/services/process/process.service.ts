import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/core/config/environment.config';
import {
  ProcessFilter,
  ProcessResponse,
  ProcessResponseMeta,
  ProcessImportBatchResponse,
} from '@app/core/models/process/process.model';

@Injectable({
  providedIn: 'root',
})
export class ProcessService {
  private _http = inject(HttpClient);

  /**
   * Get processes with filters and pagination
   *
   * @param filters - Filter options
   * @returns Observable with processes response
   */
  getProcesses(filters: ProcessFilter = {}): Observable<ProcessResponse> {
    let params = new HttpParams();

    if (filters.page) {
      params = params.set('page', filters.page.toString());
    }
    if (filters.per_page) {
      params = params.set('per_page', filters.per_page.toString());
    }

    if (filters.process_number) {
      params = params.set('process_number', filters.process_number);
    }
    if (filters.court) {
      params = params.set('court', filters.court);
    }
    if (filters.process_class) {
      params = params.set('process_class', filters.process_class);
    }
    if (filters.plaintiff) {
      params = params.set('plaintiff', filters.plaintiff);
    }
    if (filters.defendant) {
      params = params.set('defendant', filters.defendant);
    }
    if (filters.organization) {
      params = params.set('organization', filters.organization);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.has_multiple_instances !== undefined && filters.has_multiple_instances !== null) {
      params = params.set('has_multiple_instances', filters.has_multiple_instances.toString());
    }
    if (filters.process_date) {
      params = params.set('process_date', filters.process_date);
    }
    if (filters.process_date_from) {
      params = params.set('process_date_from', filters.process_date_from);
    }
    if (filters.process_date_to) {
      params = params.set('process_date_to', filters.process_date_to);
    }
    if (filters.created_at_from) {
      params = params.set('created_at_from', filters.created_at_from);
    }
    if (filters.created_at_to) {
      params = params.set('created_at_to', filters.created_at_to);
    }
    if (filters.last_api_update_from) {
      params = params.set('last_api_update_from', filters.last_api_update_from);
    }
    if (filters.last_api_update_to) {
      params = params.set('last_api_update_to', filters.last_api_update_to);
    }

    const url = `${environment.apiBaseUrl}/processes`;

    return this._http.get<ProcessResponse>(url, { params }).pipe(
      map((response) => {
        const baseNumber = response.from ?? (response.current_page - 1) * response.per_page + 1;
        const mappedProcesses = response.data.map((process, index) => {
          const displayNumber = baseNumber + index;
          return {
            ...process,
            display_number: displayNumber,
          };
        });

        return {
          ...response,
          data: mappedProcesses,
        };
      })
    );
  }

  /**
   * Import processes from Excel file (xlsx) for a given organization.
   * Import runs in background; user receives a report by email.
   *
   * @param file - Excel file (.xlsx)
   * @param organizationId - Organization UUID to assign the imported processes to
   * @returns Observable with message and batch_id
   */
  importProcesses(file: File, organizationId: string): Observable<ProcessImportBatchResponse> {
    const url = `${environment.apiBaseUrl}/processes/import`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('organization_id', organizationId);
    return this._http.post<ProcessImportBatchResponse>(url, formData);
  }
}
