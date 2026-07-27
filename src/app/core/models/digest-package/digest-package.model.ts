export type DigestPackageChannels = Record<string, string[]>;

export interface DigestPackageOrganization {
  organization_id: string;
  organization_name: string;
  pending_processes: number;
  pending_actions: number;
  channels: DigestPackageChannels;
}

export interface DigestPackagePreview {
  /** Número de consolidados listos (1 por organización con pendientes). KPI principal. */
  consolidates_ready: number;
  total_pending_processes: number;
  total_pending_actions: number;
  auto_digest_enabled: boolean;
  organizations: DigestPackageOrganization[];
}

export interface DigestPackageSendResult {
  organizations_queued: number;
  message: string;
}
