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
  ProcessDashboardStats,
  ProcessDetailResponse,
  ActionFilter,
  ActionResponse,
  AlertKeywordsResponse,
  AlertKeywordStatsResponse,
  ProcessDetailInstance,
  BulkRoleUpdateResponse,
  SubjectUpsertPayload,
  SaveProcessSubjectsResponse,
} from '@app/core/models/process/process.model';
import { ProcessDataSource } from '@app/core/models/process/process-data-source.model';

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
    if (filters.privacy === 'private' || filters.privacy === 'public') {
      params = params.set('privacy', filters.privacy);
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
   * También cubre importación marcada como privada con fuente SAMAI / Rama Judicial
   * (`is_private` + `data_source_slug`). POST /processes/private-import queda para otros casos.
   *
   * @param file - Excel file (.xlsx)
   * @param organizationId - Organization UUID to assign the imported processes to
   * @param options - Optional private import flags
   * @returns Observable with message and batch_id
   */
  importProcesses(
    file: File,
    organizationId: string,
    options?: { isPrivate?: boolean; dataSourceSlug?: string }
  ): Observable<ProcessImportBatchResponse> {
    const url = `${environment.apiBaseUrl}/processes/import`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('organization_id', organizationId);
    if (options?.isPrivate) {
      formData.append('is_private', '1');
      const slug = options.dataSourceSlug?.trim();
      if (slug) {
        formData.append('data_source_slug', slug);
      }
    }
    return this._http.post<ProcessImportBatchResponse>(url, formData);
  }

  /**
   * Lista fuentes de datos para importación de procesos privados.
   */
  getProcessDataSources(): Observable<ProcessDataSource[]> {
    const url = `${environment.apiBaseUrl}/process-data-sources`;
    return this._http.get<ProcessDataSource[]>(url);
  }

  /**
   * Importa procesos privados vía POST /processes/private-import.
   * Reservado para otros casos; el flujo UI actual (SAMAI / Rama Judicial) usa {@link importProcesses}.
   */
  importPrivateProcesses(
    file: File,
    organizationId: string,
    dataSourceSlug: string
  ): Observable<ProcessImportBatchResponse> {
    const url = `${environment.apiBaseUrl}/processes/private-import`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('organization_id', organizationId);
    formData.append('data_source_slug', dataSourceSlug);
    return this._http.post<ProcessImportBatchResponse>(url, formData);
  }

  /**
   * Get dashboard stats for process KPI cards
   */
  getDashboardStats(): Observable<ProcessDashboardStats> {
    const url = `${environment.apiBaseUrl}/dashboard/stats`;
    return this._http.get<ProcessDashboardStats>(url);
  }

  /**
   * Get process detail by ID
   */
  getProcessDetail(id: string): Observable<ProcessDetailResponse> {
    const url = `${environment.apiBaseUrl}/processes/${id}`;
    return this._http.get<ProcessDetailResponse>(url);
  }

  /**
   * Get all instances for a process number/group
   */
  getProcessInstances(id: string): Observable<ProcessDetailInstance[]> {
    const url = `${environment.apiBaseUrl}/processes/${id}/instances`;
    return this._http
      .get<
        | ProcessDetailInstance[]
        | { instances?: ProcessDetailInstance[]; data?: ProcessDetailInstance[] }
      >(url)
      .pipe(
        map((response) => {
          if (Array.isArray(response)) {
            return response;
          }
          if (response?.instances?.length) {
            return response.instances;
          }
          if (response?.data?.length) {
            return response.data;
          }
          return [];
        })
      );
  }

  /**
   * Get alert keywords for a process (for filtering actions by keyword)
   */
  getAlertKeywords(processId: string): Observable<AlertKeywordsResponse> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/alert-keywords`;
    return this._http.get<AlertKeywordsResponse>(url);
  }

  /**
   * Get alert keyword stats for a process (count per keyword)
   */
  getAlertKeywordStats(processId: string): Observable<AlertKeywordStatsResponse> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/alert-keyword-stats`;
    return this._http.get<AlertKeywordStatsResponse>(url);
  }

  /**
   * Get process actions with filters and pagination
   */
  getProcessActions(id: string, filters: ActionFilter = {}): Observable<ActionResponse> {
    let params = new HttpParams();

    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.per_page) params = params.set('per_page', filters.per_page.toString());

    if (filters.action_date_from) params = params.set('action_date_from', filters.action_date_from);
    if (filters.action_date_to) params = params.set('action_date_to', filters.action_date_to);
    if (filters.registration_date_from) params = params.set('registration_date_from', filters.registration_date_from);
    if (filters.registration_date_to) params = params.set('registration_date_to', filters.registration_date_to);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.alert_slug) params = params.set('alert_slug', filters.alert_slug);

    const url = `${environment.apiBaseUrl}/processes/${id}/actions`;
    return this._http.get<ActionResponse>(url, { params });
  }

  /**
   * Update process status (activate/deactivate)
   */
  updateProcessStatus(id: string, isActive: boolean): Observable<{ message: string }> {
    const url = `${environment.apiBaseUrl}/processes/${id}/status`;
    return this._http.patch<{ message: string }>(url, { is_active: isActive });
  }

  /**
   * Get available roles for processes
   */
  getProcessRoles(): Observable<{ value: string; label: string }[]> {
    const url = `${environment.apiBaseUrl}/config/processes/roles`;
    return this._http.get<{ value: string; label: string }[]>(url);
  }

  /**
   * Update lawyer role for a process
   */
  updateProcessRole(id: string, role: string): Observable<{ message: string }> {
    const url = `${environment.apiBaseUrl}/processes/${id}/config/roles`;
    return this._http.post<{ message: string }>(url, { lawyer_role: role });
  }

  /**
   * Update lawyer role for a process scoped to an organization (admin)
   */
  updateOrganizationProcessRole(
    processId: string,
    organizationId: string,
    role: string
  ): Observable<{ message: string }> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/organizations/${organizationId}/config/roles`;
    return this._http.post<{ message: string }>(url, { lawyer_role: role });
  }

  /**
   * Update tracking status for a process scoped to an organization (admin)
   */
  updateOrganizationProcessStatus(
    processId: string,
    organizationId: string,
    isActive: boolean
  ): Observable<{ message: string }> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/organizations/${organizationId}/status`;
    return this._http.patch<{ message: string }>(url, { is_active: isActive });
  }

  /**
   * Create or update process subjects (batch append/update; does not delete omitted subjects)
   */
  saveProcessSubjects(
    processId: string,
    subjects: SubjectUpsertPayload[]
  ): Observable<SaveProcessSubjectsResponse> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/subjects`;
    return this._http.put<SaveProcessSubjectsResponse>(url, { subjects });
  }

  /**
   * Delete a manual process subject from a process
   */
  deleteProcessSubject(processId: string, subjectId: string): Observable<{ message: string }> {
    const url = `${environment.apiBaseUrl}/processes/${processId}/subjects/${subjectId}`;
    return this._http.delete<{ message: string }>(url);
  }

  /**
   * Update lawyer role for multiple processes in bulk
   */
  updateBulkProcessRoles(processIds: string[], role: string): Observable<BulkRoleUpdateResponse> {
    const url = `${environment.apiBaseUrl}/processes/bulk-config/roles`;
    return this._http.patch<BulkRoleUpdateResponse>(url, {
      process_ids: processIds,
      lawyer_role: role,
    });
  }
}
