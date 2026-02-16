/**
 * Organization (Client) Model - Based on API response
 */
export interface Organization {
  index: number;
  id: string;
  name: string;
  slug: string;
  type: string;
  identification: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Organization filter options (query params)
 */
export interface OrganizationFilter {
  page?: number;
  per_page?: number;
  name?: string;
  type?: string;
  is_active?: string; // 'active' | 'inactive'
  created_at_from?: string;
  created_at_to?: string;
  email?: string;
}

/**
 * Select option for dropdowns (organization-types, organization-statuses)
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * API response for organization-types / organization-statuses
 */
export interface SelectOptionsResponse {
  data: SelectOption[];
}

/**
 * Laravel pagination link
 */
export interface PaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

/**
 * Organization list response from API (Laravel Pagination)
 */
export interface OrganizationResponse {
  current_page: number;
  data: Organization[];
  first_page_url: string;
  from: number;
  last_page: number;
  last_page_url: string;
  links: PaginationLink[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number;
  total: number;
}

/**
 * Organization response meta (simplified for component usage)
 */
export interface OrganizationResponseMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

/**
 * Payload to create an organization (POST /organizations)
 */
export interface CreateOrganizationPayload {
  name: string;
  type: 'natural' | 'juridical';
  identification?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}
