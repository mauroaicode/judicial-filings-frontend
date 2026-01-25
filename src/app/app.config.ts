import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, provideAppInitializer, inject, isDevMode } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AVAILABLE_LANGUAGES } from './core/transloco/languages.constants';
import { TranslocoHttpLoader } from './core/transloco/transloco.http-loader';
import { THEME_CONFIG } from './core/config/theme.config';
import { authInterceptor } from './core/interceptors/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    ),
    provideRouter(routes),
    
    // Transloco Config
    provideTransloco({
      config: {
        availableLangs: AVAILABLE_LANGUAGES,
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const translocoService = inject(TranslocoService);
      const defaultLang = translocoService.getDefaultLang();
      translocoService.setActiveLang(defaultLang);
      
      // Initialize theme
      THEME_CONFIG.setTheme(THEME_CONFIG.defaultTheme);
      
      return firstValueFrom(translocoService.load(defaultLang));
    }),
  ]
};
