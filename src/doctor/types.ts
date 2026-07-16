export type DoctorCategory = "core" | "android" | "frida" | "unity" | "native";

export type DoctorStatus = "ok" | "warning" | "missing" | "error";

export interface DoctorCheck {
  id: string;
  name: string;
  category: DoctorCategory;
  status: DoctorStatus;
  version?: string;
  path?: string;
  details?: string[];
  suggestion?: string;
}

export interface AndroidDeviceSummary {
  serial: string;
  state: string;
  model?: string;
  architecture?: string;
  androidVersion?: string;
}

export interface DoctorReport {
  generatedAt: string;
  platform: NodeJS.Platform;
  architecture: string;
  checks: DoctorCheck[];
  devices: AndroidDeviceSummary[];
  summary: {
    ok: number;
    warnings: number;
    missing: number;
    errors: number;
  };
}

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
  timedOut: boolean;
}

export interface CommandRunner {
  run(command: string, args?: string[], timeoutMs?: number): Promise<CommandResult>;
}

export interface DoctorOptions {
  categories?: DoctorCategory[];
}
