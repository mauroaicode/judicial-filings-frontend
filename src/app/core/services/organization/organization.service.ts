import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@app/core/config/environment.config';
import {
  CreateOrganizationPayload,
  Organization,
  OrganizationFilter,
  OrganizationResponse,
  SelectOptionsResponse,
} from '@app/core/models/organization/organization.model';

@Injectable({
  providedIn: 'root',
})
export class OrganizationService {
  private _http = inject(HttpClient);

  /**
   * Get organizations (clients) with filters and pagination
   */
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
}
