/**
 * Fuente de datos para importación (GET /process-data-sources).
 * Slugs conocidos: judicial_branch, samai, publicaciones_procesales.
 */
export interface ProcessDataSource {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}
