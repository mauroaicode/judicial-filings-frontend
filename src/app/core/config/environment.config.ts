export const environment = {
  systemName: import.meta.env.NG_APP_SYSTEM_NAME || 'Tribunal de Ética Médica',
  baseUrl: import.meta.env.NG_APP_BASE_URL || '',
  publicKey: import.meta.env.NG_APP_PUBLIC_KEY || '',
  apiV2: import.meta.env.NG_APP_API_V2 || '',
  apiV3: import.meta.env.NG_APP_API_V3 || '',
  apiBaseUrl: import.meta.env.NG_APP_API_BASE_URL || '',
  encryptionSecretKey: import.meta.env.NG_APP_ENCRYPTION_SECRET_KEY || '',
  menuTitle: import.meta.env.NG_APP_MENU_TITLE || '',
  reverb: {
    appId: import.meta.env.NG_APP_REVERB_APP_ID || '',
    appKey: import.meta.env.NG_APP_REVERB_APP_KEY || '',
    appSecret: import.meta.env.NG_APP_REVERB_APP_SECRET || '',
    host: import.meta.env.NG_APP_REVERB_HOST || '127.0.0.1',
    port: import.meta.env.NG_APP_REVERB_PORT || 8080,
    scheme: import.meta.env.NG_APP_REVERB_SCHEME || 'http',
  },
};

