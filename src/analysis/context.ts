import type { AndroidPackage } from "../apk/android-package.js";
import type { PackageEntry } from "../apk/types.js";
import type { DetectorContext } from "./types.js";

const MAX_DEX_SCAN_SIZE = 128 * 1024 * 1024;

export class InspectionContext implements DetectorContext {
  private readonly dexSearchCache = new Map<string, Promise<string[]>>();
  readonly warnings: string[] = [];

  constructor(readonly pkg: AndroidPackage) {}

  get manifestStrings(): readonly string[] {
    return this.pkg.manifest?.rawStrings ?? [];
  }

  findEntries(pattern: RegExp): PackageEntry[] {
    return this.pkg.find(pattern);
  }

  location(entry: PackageEntry): string {
    return this.pkg.location(entry);
  }

  read(entry: PackageEntry): Promise<Buffer> {
    return this.pkg.read(entry);
  }

  searchDex(needle: string): Promise<string[]> {
    const cached = this.dexSearchCache.get(needle);
    if (cached) {
      return cached;
    }

    const promise = this.searchDexUncached(needle);
    this.dexSearchCache.set(needle, promise);
    return promise;
  }

  private async searchDexUncached(needle: string): Promise<string[]> {
    const dexEntries = this.pkg.find(/(?:^|\/)classes\d*\.dex$|\.dex$/i);
    const target = Buffer.from(needle, "utf8");
    const matches: string[] = [];

    const skipped: string[] = [];
    for (const entry of dexEntries) {
      if (entry.uncompressedSize > MAX_DEX_SCAN_SIZE) {
        skipped.push(entry.path.split("/").at(-1) ?? entry.path);
        continue;
      }
      const contents = await this.pkg.read(entry);
      if (contents.indexOf(target) >= 0) {
        matches.push(this.pkg.location(entry));
      }
    }
    if (skipped.length > 0) {
      const list = skipped.join(", ");
      if (!this.warnings.some((w) => w.includes(list))) {
        this.warnings.push(
          `Skipped ${list} during signature scanning (exceeds ${MAX_DEX_SCAN_SIZE / 1024 / 1024} MiB limit). Some framework or SDK detections may be incomplete.`,
        );
      }
    }
    return matches;
  }
}
