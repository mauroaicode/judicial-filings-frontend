# Instalación de Dependencias

Para que los componentes de autenticación funcionen correctamente, necesitas instalar las siguientes dependencias:

## 1. Instalar Tailwind CSS y DaisyUI

```bash
npm install -D tailwindcss postcss autoprefixer daisyui
# o
pnpm add -D tailwindcss postcss autoprefixer daisyui
```

## 2. Verificar archivos de configuración

Los siguientes archivos ya están creados:
- ✅ `postcss.config.js` - Configuración de PostCSS
- ✅ `tailwind.config.js` - Configuración de Tailwind con DaisyUI

## 3. Verificar que tailwind.config.js existe

El archivo `tailwind.config.js` ya está creado en la raíz del proyecto con la configuración de DaisyUI.

## 4. Verificar que styles.scss tiene las directivas de Tailwind

El archivo `src/styles.scss` ya tiene las directivas de Tailwind configuradas.

## 5. Iniciar el servidor de desarrollo

```bash
npm start
# o
pnpm start
```

## Estructura creada

- ✅ `src/app/modules/auth/sign-in/` - Componente de inicio de sesión
- ✅ `src/app/modules/auth/forgot-password/` - Componente de recuperación de contraseña
- ✅ Rutas configuradas en `app.routes.ts`
- ✅ Diseño responsive con DaisyUI
- ✅ Formularios reactivos con validación
- ✅ Signals para estado reactivo (Angular 19 Zoneless)

## Notas

- El diseño sigue el patrón de la imagen proporcionada
- La sección derecha está preparada para agregar la imagen
- Los componentes usan ChangeDetectionStrategy.OnPush (Zoneless)
- Todos los componentes son standalone

