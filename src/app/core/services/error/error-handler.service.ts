import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from '@app/core/models/common/error-response.model';

@Injectable({
  providedIn: 'root',
})
export class ErrorHandlerService {
  /**
   * Extract error message from HTTP error response
   *
   * @param error - HTTP error response
   * @param useFirstMessageOnly - If true, returns only the first message. Default: true
   * @returns Error message string or null
   */
  getErrorMessage(
    error: HttpErrorResponse | any,
    useFirstMessageOnly: boolean = true
  ): string | null {
    if (!error) {
      return null;
    }

    // Check if error has the backend format
    if (error.error && typeof error.error === 'object') {
      const backendError = error.error as ErrorResponse;

      // Check if it has the messages array
      if (Array.isArray(backendError.messages) && backendError.messages.length > 0) {
        if (useFirstMessageOnly) {
          return backendError.messages[0];
        }
        return backendError.messages.join('. ');
      }
    }

    // Check for error.message (standard HTTP error)
    if (error.message) {
      return error.message;
    }

    // Default error message based on status code
    return this.getDefaultErrorMessage(error.status);
  }

  /**
   * Extract all error messages from HTTP error response
   *
   * @param error - HTTP error response
   * @returns Array of error messages
   */
  getAllErrorMessages(error: HttpErrorResponse | any): string[] {
    if (!error) {
      return [];
    }

    // Check if error has the backend format
    if (error.error && typeof error.error === 'object') {
      const backendError = error.error as ErrorResponse;

      // Check if it has the messages array
      if (Array.isArray(backendError.messages) && backendError.messages.length > 0) {
        return backendError.messages;
      }
    }

    // Check for error.message (standard HTTP error)
    if (error.message) {
      return [error.message];
    }

    // Default error message based on status code
    const defaultMessage = this.getDefaultErrorMessage(error.status);
    return defaultMessage ? [defaultMessage] : [];
  }

  /**
   * Get default error message based on HTTP status code
   *
   * @param status - HTTP status code
   * @returns Default error message or null
   */
  private getDefaultErrorMessage(status?: number): string | null {
    if (!status) {
      return 'Ha ocurrido un error. Por favor, intenta nuevamente.';
    }

    switch (status) {
      case 400:
        return 'Solicitud inválida. Por favor, verifica los datos enviados.';
      case 401:
        return 'No autorizado. Por favor, inicia sesión nuevamente.';
      case 403:
        return 'No tienes permisos para realizar esta acción.';
      case 404:
        return 'Recurso no encontrado.';
      case 422:
        return 'Error de validación. Por favor, verifica los datos.';
      case 500:
        return 'Error del servidor. Por favor, intenta más tarde.';
      case 503:
        return 'Servicio no disponible. Por favor, intenta más tarde.';
      default:
        return 'Ha ocurrido un error. Por favor, intenta nuevamente.';
    }
  }

  /**
   * Check if error is a validation error (422)
   *
   * @param error - HTTP error response
   * @returns true if error is a validation error
   */
  isValidationError(error: HttpErrorResponse | any): boolean {
    if (!error) {
      return false;
    }

    if (error.status === 422) {
      return true;
    }

    if (error.error && typeof error.error === 'object') {
      const backendError = error.error as ErrorResponse;
      return backendError.code === 422;
    }

    return false;
  }

  /**
   * Get error code from error response
   *
   * @param error - HTTP error response
   * @returns Error code or null
   */
  getErrorCode(error: HttpErrorResponse | any): number | null {
    if (!error) {
      return null;
    }

    if (error.status) {
      return error.status;
    }

    if (error.error && typeof error.error === 'object') {
      const backendError = error.error as ErrorResponse;
      return backendError.code || null;
    }

    return null;
  }
}

