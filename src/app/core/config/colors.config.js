/**
 * Color Configuration — Admin Panel
 * Same brand identity as the client app but with a more muted,
 * enterprise-grade feel. Key differences:
 *   - Base backgrounds use a cool blue-gray tint (not pure white)
 *   - Neutral/sidebar uses a distinct dark navy (#1E1B3A)
 *   - Accent gold slightly more muted
 */
const COLORS = {
  // Base colors
  white: '#ffffff',
  black: '#1E1B3A', // Admin dark navy (distinct from client's #24163E)

  // Primary brand colors (shared with client)
  primary: '#4B2A7D',        // Main brand purple
  primaryDark: '#371B58',    // Darker purple for hover states
  primaryLight: '#F3F0F9',   // Very light purple for subtle backgrounds

  // Secondary brand
  orchid: '#7C57B7',         // Secondary purple (muted)
  yellowGreen: '#FBB03B',    // Brand gold/accent
  khaki: '#FEF3C7',          // Light gold tint for backgrounds
  lightSkyBlue: '#C7D2FE',   // Indigo-tinted light blue

  // Gray scale — admin uses cool blue-grays instead of neutral grays
  grayDark: '#4B5563',
  gray: '#9CA3AF',
  gainsboro: '#F4F5F9',      // Admin base-100: subtle blue-gray (not pure white)
  lightGray: '#E8EAF2',      // Admin base-200: cool gray with slight blue

  // Status colors (same professional shades as client)
  salmon: '#EF4444',         // Professional red
  green: '#059669',          // Emerald green
  limeGreen: '#84CC16',
  orange: '#F59E0B',         // Amber orange

  // Text colors
  textOnWhite: '#1F2937',
  textOnDark: '#FFFFFF',

  // Button colors
  buttonPrimary: '#4B2A7D',
  buttonPrimaryBorder: '#4B2A7D',
  buttonHoverText: '#FFFFFF',
  buttonHoverBorder: '#371B58',
};

module.exports = { COLORS };

