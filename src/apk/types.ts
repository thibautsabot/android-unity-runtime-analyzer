export type AndroidPackageFormat = "apk" | "xapk" | "apks" | "zip";

export interface ManifestActivity {
  name: string;
  exported?: boolean;
  permission?: string;
  launcher: boolean;
}

export interface ManifestComponent {
  name: string;
  exported?: boolean;
  permission?: string;
}

export interface ManifestProvider extends ManifestComponent {
  authorities?: string;
  readPermission?: string;
  writePermission?: string;
}

export interface ManifestMetaData {
  name: string;
  value?: string;
}

export interface ManifestInfo {
  packageName?: string;
  splitName?: string;
  versionCode?: number;
  versionName?: string;
  minSdk?: number | string;
  targetSdk?: number | string;
  debuggable?: boolean;
  allowBackup?: boolean;
  usesCleartextTraffic?: boolean;
  networkSecurityConfig?: string;
  permissions: string[];
  activities: ManifestActivity[];
  services: ManifestComponent[];
  receivers: ManifestComponent[];
  providers: ManifestProvider[];
  metaData: ManifestMetaData[];
  rawStrings: string[];
}

export interface PackageEntry {
  partName: string;
  path: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface PackagePartSummary {
  name: string;
  splitName?: string;
  base: boolean;
  entries: number;
}
