import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '@app/core/auth/auth.service';
import { AuthUtils } from '@app/core/auth/auth.utils';
import { Observable, catchError, throwError } from 'rxjs';

/**
 * Auth Interceptor
 * Adds Authorization header to requests and handles 401 errors
 *
 * @param req - HTTP request
 * @param next - HTTP handler
 * @returns Observable with HTTP event
 */
export const authInterceptor = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);

  // Clone the request object
  let newReq = req.clone();

  // Request
  //
  // For Laravel Sanctum, we add the Authorization header if the token exists.
  // The server will validate if the token is expired or invalid and return 401.
  const token = authService.accessToken;
  if (token && AuthUtils.isTokenValid(token)) {
    newReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
  }

  // Response
  return next(newReq).pipe(
    catchError((error) => {
      // Catch "401 Unauthorized" responses
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Sign out
        authService.signOut();

        // Reload the app
        location.reload();
      }

      return throwError(() => error);
    })
  );
};

