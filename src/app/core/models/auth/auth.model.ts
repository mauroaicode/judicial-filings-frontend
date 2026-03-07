export interface AuthResponse {
  token: string;
  user: User;
}

export interface User {
  id: number;
  name: string;
  last_name: string;
  email: string;
  document_type: string;
  document_number: string;
  phone: string;
  address: string;
  status: string;
  organization_id?: number;
  roles: Role[];
  requires_password_change: boolean;
}

export interface Role {
  value: string;
  label: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

