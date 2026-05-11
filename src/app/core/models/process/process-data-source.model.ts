/**
 * Fuente de datos para importación de procesos privados (GET /process-data-sources)
 */
export interface ProcessDataSource {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}
