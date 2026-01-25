import { Injectable } from '@angular/core';
import { STORAGE } from '@app/core/constants/storage.constant';

@Injectable({
  providedIn: 'root',
})
export class SessionStorageService {
  /**
   * Save JWT token to session storage
   *
   * @param token - JWT token string
   */
  saveJwt(token: string): void {
    try {
      sessionStorage.setItem(STORAGE.JWT, token);
    } catch (error) {
      console.error('Error saving JWT to sessionStorage:', error);
    }
  }

  /**
   * Get JWT token from session storage
   *
   * @returns JWT token string or null
   */
  getJwt(): string | null {
    try {
      return sessionStorage.getItem(STORAGE.JWT);
    } catch (error) {
      console.error('Error getting JWT from sessionStorage:', error);
      return null;
    }
  }

  /**
   * Remove JWT token from session storage
   */
  removeJwt(): void {
    try {
      sessionStorage.removeItem(STORAGE.JWT);
    } catch (error) {
      console.error('Error removing JWT from sessionStorage', error);
    }
  }
}

