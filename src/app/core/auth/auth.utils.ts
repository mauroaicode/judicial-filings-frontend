/**
 * Auth Utilities
 * Methods for Laravel Sanctum token validation
 * 
 * Note: Laravel Sanctum uses simple hash tokens, not JWT.
 * Token expiration is validated on the server side.
 */

export class AuthUtils {
  /**
   * Check if token exists and is valid format
   * 
   * For Laravel Sanctum, we don't validate expiration on the client side.
   * The server will return 401 if the token is expired or invalid.
   *
   * @param token - Laravel Sanctum token string (format: "token_id|hash")
   * @returns true if token exists and has valid format, false otherwise
   */
  static isTokenValid(token: string | null): boolean {
    // Return false if there is no token
    if (!token || token === '') {
      return false;
    }

    // Laravel Sanctum tokens have format: "token_id|hash"
    // We just need to check that it exists and is not empty
    // The server will validate if it's expired or invalid
    return token.trim().length > 0;
  }

  /**
   * Is token expired?
   * 
   * For Laravel Sanctum, we cannot determine expiration on the client side.
   * This method always returns false, and the server will handle expiration.
   *
   * @param token - Laravel Sanctum token string
   * @returns false (expiration is handled by server)
   */
  static isTokenExpired(token: string | null): boolean {
    // For Sanctum tokens, we can't check expiration on client side
    // The server will return 401 if the token is expired
    return false;
  }
}

