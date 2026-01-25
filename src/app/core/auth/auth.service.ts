import {HttpClient} from '@angular/common/http';
import {inject, Injectable, signal} from '@angular/core';
import {Observable, of} from 'rxjs';
import {environment} from '@app/core/config/environment.config';
import {AuthResponse, LoginRequest, User} from '@app/core/models/auth/auth.model';
import {SessionStorageService} from '@app/core/services/storage/session-storage.service';
import {STORAGE} from '@app/core/constants/storage.constant';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private _httpClient = inject(HttpClient);
  private _sessionStorageService = inject(SessionStorageService);

  private _user = signal<User | null>(null);
  private _token = signal<string | null>(null);

  public readonly user = this._user.asReadonly();
  public readonly token = this._token.asReadonly();

  public readonly isAuthenticated = signal<boolean>(false);

  constructor() {
    this._loadFromStorage();
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Accessors
  // -----------------------------------------------------------------------------------------------------

  /**
   * Getter for access token
   */
  get accessToken(): string | null {
    return this._token() || this._sessionStorageService.getJwt();
  }

  /**
   * Setter for access token
   */
  set accessToken(token: string | null) {
    if (token) {
      this._token.set(token);
      this._sessionStorageService.saveJwt(token);
      localStorage.setItem(STORAGE.JWT, token);
      return;
    }
    this._token.set(null);
    this._sessionStorageService.removeJwt();
    localStorage.removeItem(STORAGE.JWT);
  }

  /**
   * Getter for current user
   */
  get currentUser(): User | null {
    return this._user();
  }

  /**
   * Setter for current user
   */
  set currentUser(user: User | null) {
    this._user.set(user);
    if (user) {
      localStorage.setItem(STORAGE.USER, JSON.stringify(user));
      this.isAuthenticated.set(true);

      return;
    }
    localStorage.removeItem(STORAGE.USER);
    this.isAuthenticated.set(false);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Public methods
  // -----------------------------------------------------------------------------------------------------

  /**
   * Sign in
   *
   * @param credentials - Login credentials
   * @returns Observable with auth response
   */
  signIn(credentials: LoginRequest): Observable<AuthResponse> {
    const url = `${environment.apiBaseUrl}/login`;
    return this._httpClient.post<AuthResponse>(url, credentials);
  }

  /**
   * Sign out
   */
  signOut(): Observable<boolean> {
    this.accessToken = null;
    this.currentUser = null;

    return of(true);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Private methods
  // -----------------------------------------------------------------------------------------------------

  /**
   * Load user and token from storage
   */
  private _loadFromStorage(): void {
    const token = this._sessionStorageService.getJwt() || localStorage.getItem(STORAGE.JWT);
    const userStr = localStorage.getItem(STORAGE.USER);

    if (token) {
      this._token.set(token);
    }

    if (userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        this._user.set(user);
        this.isAuthenticated.set(true);
      } catch (error) {
        console.error('Error parsing user from storage:', error);
        localStorage.removeItem(STORAGE.USER);
      }
    }
  }
}

