declare interface Env {
  readonly NODE_ENV: string;
  readonly NG_APP_SYSTEM_NAME: string;
  readonly NG_APP_PUBLIC_KEY: string;
  readonly NG_APP_API_V2: string;
  readonly NG_APP_API_V3: string;
  readonly NG_APP_API_BASE_URL: string;
  readonly NG_APP_ENCRYPTION_SECRET_KEY: string;
  readonly NG_APP_MENU_TITLE: string;
  [key: string]: any;
}

declare interface ImportMeta {
  readonly env: Env;
}

