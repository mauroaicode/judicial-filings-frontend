/** @type {import('tailwindcss').Config} */
const { COLORS } = require('./src/app/core/config/colors.config');

module.exports = {
  content: [
    './src/**/*.{html,ts,scss}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom color palette
        primary: COLORS.primary,
        'primary-dark': COLORS.primaryDark,
        'primary-light': COLORS.primaryLight,
        'yellow-green': COLORS.yellowGreen,
        orchid: COLORS.orchid,
        khaki: COLORS.khaki,
        'light-sky-blue': COLORS.lightSkyBlue,
        'gray-dark': COLORS.grayDark,
        gray: COLORS.gray,
        gainsboro: COLORS.gainsboro,
        'light-gray': COLORS.lightGray,
        salmon: COLORS.salmon,
        green: COLORS.green,
        'lime-green': COLORS.limeGreen,
        orange: COLORS.orange,
        // Text colors
        'text-on-white': COLORS.textOnWhite,
        'text-on-dark': COLORS.textOnDark,
        // Button colors
        'button-primary': COLORS.buttonPrimary,
        'button-primary-border': COLORS.buttonPrimaryBorder,
        'button-hover-text': COLORS.buttonHoverText,
        'button-hover-border': COLORS.buttonHoverBorder,
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        light: {
          ...require('daisyui/src/theming/themes')['light'],
          // Brand purple (shared with client app)
          primary: COLORS.primary,
          'primary-content': COLORS.textOnDark,
          // Muted secondary purple (admin is more enterprise, less vibrant)
          secondary: COLORS.orchid,
          'secondary-content': COLORS.textOnDark,
          // Brand gold accent
          accent: COLORS.yellowGreen,
          'accent-content': '#1F2937',
          // Admin dark navy for sidebar/neutral (distinct from client #24163E)
          neutral: COLORS.black,
          'neutral-content': COLORS.textOnDark,
          // Admin base uses cool blue-gray tint (differentiates from client's pure white)
          'base-100': '#FFFFFF',
          'base-200': COLORS.gainsboro,
          'base-300': COLORS.lightGray,
          'base-content': COLORS.textOnWhite,
          // Semantic states — professional, aligned with client
          success: COLORS.green,
          'success-content': '#ffffff',
          warning: COLORS.orange,
          'warning-content': '#ffffff',
          error: COLORS.salmon,
          'error-content': '#ffffff',
          info: COLORS.orchid,
          'info-content': '#ffffff',
        },
      },
    ],
    base: true,
    styled: true,
    utils: true,
    prefix: '',
    logs: true,
    themeRoot: ':root',
  },
};

