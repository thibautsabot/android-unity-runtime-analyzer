import * as yauzl from "yauzl";

export class ZipArchive {
  private readonly byName = new Map<string, yauzl.Entry>();

  private constructor(
    private readonly zipFile: yauzl.ZipFile,
    readonly entries: yauzl.Entry[],
  ) {
    for (const entry of entries) {
      this.byName.set(normalizePath(entry.fileName), entry);
    }
  }

  static async fromFile(path: string): Promise<ZipArchive> {
    const zipFile = await yauzl.openPromise(path, { lazyEntries: true, autoClose: false });
    return ZipArchive.collect(zipFile);
  }

  static async fromBuffer(buffer: Buffer): Promise<ZipArchive> {
    const zipFile = await yauzl.fromBufferPromise(buffer, { lazyEntries: true, autoClose: false });
    return ZipArchive.collect(zipFile);
  }

  private static async collect(zipFile: yauzl.ZipFile): Promise<ZipArchive> {
    const entries: yauzl.Entry[] = [];
    for await (const entry of zipFile.eachEntry()) {
      if (!entry.fileName.endsWith("/")) {
        entries.push(entry);
      }
    }
    return new ZipArchive(zipFile, entries);
  }

  has(name: string): boolean {
    return this.byName.has(normalizePath(name));
  }

  get(name: string): yauzl.Entry | undefined {
    return this.byName.get(normalizePath(name));
  }

  find(pattern: RegExp): yauzl.Entry[] {
    return this.entries.filter((entry) => {
      pattern.lastIndex = 0;
      return pattern.test(normalizePath(entry.fileName));
    });
  }

  async read(entry: yauzl.Entry | string): Promise<Buffer> {
    const resolved = typeof entry === "string" ? this.byName.get(normalizePath(entry)) : entry;
    if (!resolved) {
      throw new Error(`ZIP entry not found: ${String(entry)}`);
    }
    if (resolved.uncompressedSize > 512 * 1024 * 1024) {
      throw new Error(`Refusing to expand ZIP entry larger than 512 MiB: ${resolved.fileName}`);
    }

    const stream = await this.zipFile.openReadStreamPromise(resolved);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async close(): Promise<void> {
    this.zipFile.close();
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}
