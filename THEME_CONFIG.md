# Configuración de Tema

## Controlar el Tema Dark/Light

Para activar o desactivar el modo dark, edita el archivo:

**`src/app/core/config/theme.config.ts`**

### Opciones disponibles:

```typescript
export const THEME_CONFIG = {
  // Tema por defecto: 'light' o 'dark'
  defaultTheme: 'light' as 'light' | 'dark',
  
  // Habilitar dark mode (true = dark, false = light)
  enableDarkMode: false,
  
  // ... otros métodos
};
```

### Cambiar a modo dark:

1. Abre `src/app/core/config/theme.config.ts`
2. Cambia `enableDarkMode: false` a `enableDarkMode: true`
3. O cambia `defaultTheme: 'light'` a `defaultTheme: 'dark'`

### Cambiar a modo light:

1. Abre `src/app/core/config/theme.config.ts`
2. Cambia `enableDarkMode: true` a `enableDarkMode: false`
3. O cambia `defaultTheme: 'dark'` a `defaultTheme: 'light'`

## Uso en Componentes

Para cambiar el tema programáticamente desde un componente:

```typescript
import { THEME_CONFIG } from '@app/core/config/theme.config';

// Cambiar a dark
THEME_CONFIG.setTheme('dark');

// Cambiar a light
THEME_CONFIG.setTheme('light');

// Alternar entre light/dark
const newTheme = THEME_CONFIG.toggleTheme();

// Obtener tema actual
const currentTheme = THEME_CONFIG.getCurrentTheme();
```

## Colores Disponibles

Los colores están definidos en `src/app/core/config/colors.config.ts` y `colors.config.js`.

### Colores en Tailwind:

- `bg-primary` - Color principal (#161326)
- `text-primary` - Texto con color principal
- `bg-yellow-green` - Verde amarillento (#C0FAA0)
- `bg-orchid` - Orquídea (#C388F7)
- `bg-khaki` - Caqui (#ECFF79)
- `bg-light-sky-blue` - Azul cielo claro (#AFC0FF)
- `text-on-white` - Texto para fondo blanco (#0a0a0c)
- `text-on-dark` - Texto para fondo oscuro (#fff)

### Clases DaisyUI:

- `btn-primary` - Botón con estilo principal
- `bg-base-100` - Fondo base
- `bg-base-200` - Fondo secundario
- `bg-base-300` - Fondo terciario
- `text-base-content` - Color de texto base

## Ejemplo de Uso

```html
<!-- Botón principal -->
<button class="btn btn-primary">
  Click me
</button>

<!-- Texto en fondo blanco -->
<p class="text-on-white">Texto oscuro</p>

<!-- Texto en fondo oscuro -->
<p class="text-on-dark">Texto claro</p>

<!-- Usar colores personalizados -->
<div class="bg-primary text-on-dark">
  Contenedor con color principal
</div>
```

