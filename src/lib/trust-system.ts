export type TrustLevel = 'unverified' | 'verified' | 'trusted' | 'official';

export interface ToolTrustInfo {
  toolName: string;
  provider: string;
  trustLevel: TrustLevel;
  securityRating: number; // 0-100
  lastAuditDate: string;
}

const trustRegistry: Record<string, ToolTrustInfo> = {
  geocode_location: {
    toolName: 'geocode_location',
    provider: 'OpenStreetMap',
    trustLevel: 'official',
    securityRating: 95,
    lastAuditDate: '2026-01-01',
  },
  search_restaurant: {
    toolName: 'search_restaurant',
    provider: 'Overpass API',
    trustLevel: 'official',
    securityRating: 90,
    lastAuditDate: '2026-01-01',
  },
};

export function getToolTrustInfo(toolName: string): ToolTrustInfo {
  return trustRegistry[toolName] || {
    toolName,
    provider: 'unknown',
    trustLevel: 'unverified',
    securityRating: 0,
    lastAuditDate: new Date().toISOString(),
  };
}

export function isToolSafe(toolName: string, minRating: number = 50): boolean {
  const info = getToolTrustInfo(toolName);
  return info.securityRating >= minRating;
}
