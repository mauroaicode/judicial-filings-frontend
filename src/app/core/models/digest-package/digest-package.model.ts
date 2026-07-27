export type DigestPackageChannels = Record<string, string[]>;

export interface DigestPackageOrganization {
  organization_id: string;
  organization_name: string;
  pending_actions: number;
  channels: DigestPackageChannels;
}

export interface DigestPackagePreview {
  organizations_count: number;
  total_pending_actions: number;
  auto_digest_enabled: boolean;
  organizations: DigestPackageOrganization[];
}

export interface DigestPackageSendResult {
  organizations_queued: number;
  message: string;
}
