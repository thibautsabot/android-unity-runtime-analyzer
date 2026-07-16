import { basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { parseAndroidManifest } from "./axml.js";
import type {
  AndroidPackageFormat,
  ManifestInfo,
  PackageEntry,
  PackagePartSummary,
} from "./types.js";
import type { Entry as ZipEntry } from "yauzl";
import { ZipArchive } from "./zip-reader.js";
import { messageOf } from "../utils.js";

interface PackagePart {
  name: string;
  archive: ZipArchive;
  manifest?: ManifestInfo;
  base: boolean;
}

export class AndroidPackage {
  // Only cache files below this threshold to avoid holding large native libs in memory.
  private static readonly READ_CACHE_MAX_BYTES = 4 * 1024 * 1024;
  private readonly readCache = new Map<string, Promise<Buffer>>();
  private closed = false;

  private constructor(
    readonly inputPath: string,
    readonly format: AndroidPackageFormat,
    private readonly rootArchive: ZipArchive,
    private readonly parts: PackagePart[],
    readonly sha256: string,
    readonly size: number,
    readonly warnings: string[],
  ) {}

  static async open(inputPath: string): Promise<AndroidPackage> {
    const [rootArchive, sha256, size] = await Promise.all([
      ZipArchive.fromFile(inputPath),
      hashFile(inputPath),
      fileSize(inputPath),
    ]);

    try {
      if (rootArchive.has("AndroidManifest.xml")) {
        const manifest = await readManifest(rootArchive);
        return new AndroidPackage(
          inputPath,
          "apk",
          rootArchive,
          [{ name: basename(inputPath), archive: rootArchive, manifest, base: true }],
          sha256,
          size,
          [],
        );
      }

      const nestedApks = rootArchive.find(/(?:^|\/)\w[^/]*\.apk$/i);
      if (nestedApks.length === 0) {
        throw new Error("The package contains neither AndroidManifest.xml nor nested APK files");
      }

      const warnings: string[] = [];
      const candidateParts: PackagePart[] = [];
      for (const nested of nestedApks) {
        // Asset delivery APKs (e.g. UnityDataAssetPack.apk) can be several GiB —
        // they contain only streaming game data, never code or a useful manifest.
        if (nested.uncompressedSize > 4 * 1024 * 1024 * 1024) {
          warnings.push(`Skipping ${nested.fileName}: too large to expand (${Math.round(nested.uncompressedSize / 1024 / 1024)} MiB)`);
          continue;
        }
        const nestedBuffer = await rootArchive.read(nested);
        const nestedArchive = await ZipArchive.fromBuffer(nestedBuffer);
        let manifest: ManifestInfo | undefined;
        try {
          manifest = await readManifest(nestedArchive);
        } catch (error) {
          warnings.push(`Could not parse ${nested.fileName}: ${messageOf(error)}`);
        }
        candidateParts.push({
          name: nested.fileName,
          archive: nestedArchive,
          manifest,
          base: false,
        });
      }

      const basePart = chooseBasePart(candidateParts);
      basePart.base = true;
      const extension = extname(inputPath).toLowerCase();
      const format: AndroidPackageFormat = extension === ".xapk" ? "xapk" : extension === ".apks" ? "apks" : "zip";
      warnings.push(`Analyzing ${candidateParts.length} APK parts from a ${format.toUpperCase()} container`);

      return new AndroidPackage(
        inputPath,
        format,
        rootArchive,
        candidateParts,
        sha256,
        size,
        warnings,
      );
    } catch (error) {
      await rootArchive.close();
      throw error;
    }
  }

  get manifest(): ManifestInfo | undefined {
    return this.parts.find((part) => part.base)?.manifest;
  }

  get partSummaries(): PackagePartSummary[] {
    return this.parts.map((part) => {
      const summary: PackagePartSummary = {
        name: part.name,
        base: part.base,
        entries: part.archive.entries.length,
      };
      if (part.manifest?.splitName) {
        summary.splitName = part.manifest.splitName;
      }
      return summary;
    });
  }

  entries(): PackageEntry[] {
    this.assertOpen();
    return this.parts.flatMap((part) =>
      part.archive.entries.map((entry) => toPackageEntry(part.name, entry)),
    );
  }

  find(pattern: RegExp): PackageEntry[] {
    return this.entries().filter((entry) => {
      pattern.lastIndex = 0;
      return pattern.test(entry.path);
    });
  }

  has(pattern: RegExp): boolean {
    return this.find(pattern).length > 0;
  }

  async read(entry: PackageEntry): Promise<Buffer> {
    this.assertOpen();
    const cacheKey = `${entry.partName}!${entry.path}`;
    const existing = this.readCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const part = this.parts.find((candidate) => candidate.name === entry.partName);
      if (!part) {
        throw new Error(`Package part not found: ${entry.partName}`);
      }
      return part.archive.read(entry.path);
    })();

    if (entry.uncompressedSize <= AndroidPackage.READ_CACHE_MAX_BYTES) {
      this.readCache.set(cacheKey, promise);
    }
    return promise;
  }

  location(entry: PackageEntry): string {
    if (this.parts.length === 1) {
      return entry.path;
    }
    return `${entry.partName}!${entry.path}`;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    const archives = new Set<ZipArchive>([this.rootArchive, ...this.parts.map((part) => part.archive)]);
    await Promise.all([...archives].map((archive) => archive.close()));
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Android package is already closed");
    }
  }
}

async function readManifest(archive: ZipArchive): Promise<ManifestInfo> {
  const entry = archive.get("AndroidManifest.xml");
  if (!entry) {
    throw new Error("AndroidManifest.xml is missing");
  }
  return parseAndroidManifest(await archive.read(entry));
}

function chooseBasePart(parts: PackagePart[]): PackagePart {
  const namedBase = parts.find(
    (part) => part.manifest && /(?:^|\/)base(?:-master)?\.apk$/i.test(part.name),
  );
  if (namedBase) {
    return namedBase;
  }
  const withoutSplit = parts.find(
    (part) => part.manifest && !part.manifest.splitName,
  );
  if (withoutSplit) {
    return withoutSplit;
  }
  const largest = [...parts].sort(
    (left, right) => totalUncompressed(right.archive) - totalUncompressed(left.archive),
  )[0];
  if (!largest) {
    throw new Error("No APK parts were found");
  }
  return largest;
}

function totalUncompressed(archive: ZipArchive): number {
  return archive.entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
}

function toPackageEntry(partName: string, entry: ZipEntry): PackageEntry {
  return {
    partName,
    path: entry.fileName,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
  };
}

async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function fileSize(path: string): Promise<number> {
  const { stat } = await import("node:fs/promises");
  return (await stat(path)).size;
}

