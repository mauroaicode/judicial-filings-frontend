import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/core/config/environment.config';
import {
  CreateOrganizationPayload,
  Organization,
  OrganizationDetail,
  OrganizationFilter,
  OrganizationResponse,
  OrganizationSettings,
  OrganizationStats,
  SelectOptionsResponse,
  UpdateOrganizationSettingsPayload,
  UpdateOrganizationSettingsResponse,
} from '@app/core/models/organization/organization.model';

@Injectable({
  providedIn: 'root',
})
export class OrganizationService {
  private _http = inject(HttpClient);

  /**
   * Get organizations (clients) with filters and pagination
   */
  /**
   * Resumen agregado (totales, activas/inactivas, natural/jurídica)
   */
  getOrganizationStats(): Observable<OrganizationStats> {
    const url = `${environment.apiBaseUrl}/organizations/stats`;
    return this._http.get<OrganizationStats>(url);
  }

  getOrganizations(filters: OrganizationFilter = {}): Observable<OrganizationResponse> {
    let params = new HttpParams();

    if (filters.page) {
      params = params.set('page', filters.page.toString());
    }
    if (filters.per_page) {
      params = params.set('per_page', filters.per_page.toString());
    }
    if (filters.name?.trim()) {
      params = params.set('name', filters.name.trim());
    }
    if (filters.type?.trim()) {
      params = params.set('type', filters.type.trim());
    }
    if (filters.is_active?.trim()) {
      params = params.set('is_active', filters.is_active.trim());
    }
    if (filters.created_at_from?.trim()) {
      params = params.set('created_at_from', filters.created_at_from.trim());
    }
    if (filters.created_at_to?.trim()) {
      params = params.set('created_at_to', filters.created_at_to.trim());
    }
    if (filters.email?.trim()) {
      params = params.set('email', filters.email.trim());
    }

    const url = `${environment.apiBaseUrl}/organizations`;

    return this._http.get<OrganizationResponse>(url, { params }).pipe(
      map((response) => {
        const baseNumber = response.from ?? (response.current_page - 1) * response.per_page + 1;
        const mappedData = response.data.map((item, index) => ({
          ...item,
          index: baseNumber + index,
        }));
        return {
          ...response,
          data: mappedData,
        };
      })
    );
  }

  /**
   * Get organization types for filter select (natural, juridical)
   */
  getOrganizationTypes(): Observable<SelectOptionsResponse> {
    const url = `${environment.apiBaseUrl}/organization-types`;
    return this._http.get<SelectOptionsResponse>(url);
  }

  /**
   * Get organization statuses for filter select (active, inactive)
   */
  getOrganizationStatuses(): Observable<SelectOptionsResponse> {
    const url = `${environment.apiBaseUrl}/organization-statuses`;
    return this._http.get<SelectOptionsResponse>(url);
  }

  /**
   * Create a new organization (POST /organizations)
   */
  createOrganization(payload: CreateOrganizationPayload): Observable<Organization> {
    const url = `${environment.apiBaseUrl}/organizations`;
    return this._http.post<Organization>(url, payload);
  }

  /**
   * Update notification status for an organization
   */
  updateNotificationStatus(organizationId: string, isActive: boolean): Observable<void> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/notifications-status`;
    return this._http.post<void>(url, { is_active: isActive });
  }

  /**
   * Detalle de organización + settings (GET /organizations/{id})
   */
  getOrganization(organizationId: string): Observable<OrganizationDetail> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}`;
    return this._http.get<OrganizationDetail | { data: OrganizationDetail }>(url).pipe(
      map((res) => this._unwrapData(res, 'id'))
    );
  }

  /**
   * Settings de una organización (GET /organizations/{id}/settings)
   */
  getOrganizationSettings(organizationId: string): Observable<OrganizationSettings> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/settings`;
    return this._http.get<OrganizationSettings | { data: OrganizationSettings }>(url).pipe(
      map((res) => this._unwrapData(res, 'max_active_processes'))
    );
  }

  /**
   * Guardar configuración de límites (PUT /organizations/{id}/settings).
   * `max_active_processes` debe ir siempre presente; `null` restaura el default.
   */
  updateOrganizationSettings(
    organizationId: string,
    payload: UpdateOrganizationSettingsPayload
  ): Observable<UpdateOrganizationSettingsResponse> {
    const url = `${environment.apiBaseUrl}/organizations/${organizationId}/settings`;
    return this._http
      .put<UpdateOrganizationSettingsResponse | { data: UpdateOrganizationSettingsResponse }>(url, payload)
      .pipe(map((res) => this._unwrapData(res, 'settings')));
  }

  private _unwrapData<T extends object>(res: T | { data: T }, key: keyof T): T {
    if (res && typeof res === 'object' && key in res) {
      return res as T;
    }
    if (res && typeof res === 'object' && 'data' in res && (res as { data: T }).data) {
      return (res as { data: T }).data;
    }
    return res as T;
  }
}
