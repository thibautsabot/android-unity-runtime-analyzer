import { SystemCommandRunner } from "./runner.js";
import type {
  AndroidDeviceSummary,
  CommandResult,
  CommandRunner,
  DoctorCategory,
  DoctorCheck,
  DoctorOptions,
  DoctorReport,
} from "./types.js";

const ALL_CATEGORIES: DoctorCategory[] = ["core", "android", "frida", "native", "unity"];

export async function runDoctor(
  options: DoctorOptions = {},
  runner: CommandRunner = new SystemCommandRunner(),
): Promise<DoctorReport> {
  const categories = new Set(options.categories ?? ALL_CATEGORIES);
  const checks: DoctorCheck[] = [];
  let devices: AndroidDeviceSummary[] = [];

  if (categories.has("core")) {
    checks.push(nodeCheck());
    checks.push(
      await executableCheck(runner, {
        id: "java",
        name: "Java",
        category: "core",
        candidates: [{ command: "java", args: ["-version"] }],
        version: firstVersion,
        missingSuggestion: "Install a supported JDK and add java to PATH.",
      }),
    );
    checks.push(
      await executableCheck(runner, {
        id: "python",
        name: "Python",
        category: "core",
        candidates: [
          { command: "python3", args: ["--version"] },
          { command: "python", args: ["--version"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install Python 3 and add it to PATH.",
        validate: validatePythonVersion,
      }),
    );
    checks.push(
      await executableCheck(runner, {
        id: "pip",
        name: "pip",
        category: "core",
        candidates: [
          { command: "pip3", args: ["--version"] },
          { command: "pip", args: ["--version"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install pip (usually bundled with Python 3).",
      }),
    );
    checks.push(
      await executableCheck(runner, {
        id: "pipx",
        name: "pipx",
        category: "core",
        candidates: [{ command: "pipx", args: ["--version"] }],
        version: firstVersion,
        missingSuggestion:
          "Install pipx with pip install pipx. Used to install frida-tools and other CLI utilities.",
      }),
    );
  }

  if (categories.has("android")) {
    const adb = await executableCheck(runner, {
      id: "adb",
      name: "ADB",
      category: "android",
      candidates: [{ command: "adb", args: ["version"] }],
      version: firstVersion,
      missingSuggestion: "Install Android SDK Platform Tools and add adb to PATH.",
    });
    checks.push(adb);

    if (adb.status === "ok") {
      const deviceResult = await inspectAndroidDevices(runner);
      devices = deviceResult.devices;
      checks.push(deviceResult.check);
    } else {
      checks.push({
        id: "android-device",
        name: "Android device",
        category: "android",
        status: "missing",
        details: ["Device discovery was skipped because ADB is unavailable."],
        suggestion: adb.suggestion,
      });
    }

    checks.push(
      await executableCheck(runner, {
        id: "jadx",
        name: "JADX",
        category: "android",
        candidates: [
          { command: "jadx", args: ["--version"] },
          { command: "jadx", args: ["-v"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install JADX and add its bin directory to PATH.",
      }),
    );

    checks.push(
      await executableCheck(runner, {
        id: "apktool",
        name: "apktool",
        category: "android",
        candidates: [
          { command: "apktool", args: ["--version"] },
          { command: "apktool", args: ["-version"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install apktool and add it to PATH.",
      }),
    );
  }

  if (categories.has("frida")) {
    const frida = await executableCheck(runner, {
      id: "frida",
      name: "Frida CLI",
      category: "frida",
      candidates: [{ command: "frida", args: ["--version"] }],
      version: firstVersion,
      missingSuggestion: "Install frida-tools, for example with pipx install frida-tools.",
    });
    checks.push(frida);

    if (frida.status === "ok") {
      checks.push(await inspectFridaDevice(runner));
    } else {
      checks.push({
        id: "frida-device",
        name: "Frida device connection",
        category: "frida",
        status: "missing",
        details: ["Connection test was skipped because the Frida CLI is unavailable."],
        suggestion: frida.suggestion,
      });
    }
  }

  if (categories.has("native")) {
    checks.push(
      await executableCheck(runner, {
        id: "ghidra",
        name: "Ghidra",
        category: "native",
        candidates: ghidraCandidates(),
        version: ghidraVersion,
        missingSuggestion: "Install Ghidra and add ghidraRun to PATH, or set GHIDRA_HOME.",
      }),
    );
  }

  if (categories.has("unity")) {
    checks.push(
      await executableCheck(runner, {
        id: "assetripper",
        name: "AssetRipper",
        category: "unity",
        candidates: [
          { command: "AssetRipper", args: ["--version"] },
          { command: "assetripper", args: ["--version"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install AssetRipper and add its executable to PATH.",
      }),
    );

    checks.push(
      await executableCheck(runner, {
        id: "cpp2il",
        name: "Cpp2IL",
        category: "unity",
        candidates: [
          { command: "Cpp2IL", args: ["--version"] },
          { command: "cpp2il", args: ["--version"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install Cpp2IL and add its executable to PATH.",
      }),
    );

    checks.push(
      await executableCheck(runner, {
        id: "il2cppdumper",
        name: "Il2CppDumper",
        category: "unity",
        candidates: [
          { command: "Il2CppDumper", args: ["--help"] },
          { command: "Il2CppDumper.exe", args: ["--help"] },
        ],
        version: firstVersion,
        missingSuggestion: "Install Il2CppDumper and add its executable to PATH.",
      }),
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    checks,
    devices,
    summary: {
      ok: checks.filter((check) => check.status === "ok").length,
      warnings: checks.filter((check) => check.status === "warning").length,
      missing: checks.filter((check) => check.status === "missing").length,
      errors: checks.filter((check) => check.status === "error").length,
    },
  };
}

interface ExecutableCheckOptions {
  id: string;
  name: string;
  category: DoctorCategory;
  candidates: Array<{ command: string; args: string[] }>;
  version: (result: CommandResult) => string | undefined;
  missingSuggestion: string;
  validate?: (
    result: CommandResult,
  ) => { status: DoctorCheck["status"]; detail: string } | undefined;
}

const EXECUTABLE_TIMEOUT_MS = 8_000;

async function executableCheck(
  runner: CommandRunner,
  options: ExecutableCheckOptions,
): Promise<DoctorCheck> {
  let lastFailure: CommandResult | undefined;

  for (const candidate of options.candidates) {
    const result = await runner.run(candidate.command, candidate.args, EXECUTABLE_TIMEOUT_MS);
    if (commandExists(result)) {
      const output = combinedOutput(result);
      const resolved = await resolveCommandPath(runner, candidate.command);
      const validation = options.validate?.(result);
      const status = validation?.status ?? (result.exitCode === 0 ? "ok" : "warning");
      const details: string[] = [];
      if (validation?.detail) details.push(validation.detail);
      else if (result.exitCode !== 0 && output.length > 0) details.push(firstLine(output));
      return {
        id: options.id,
        name: options.name,
        category: options.category,
        status,
        version: options.version(result),
        path: resolved ?? candidate.command,
        details: details.length > 0 ? details : undefined,
      };
    }
    lastFailure = result;
  }

  return {
    id: options.id,
    name: options.name,
    category: options.category,
    status: "missing",
    details: lastFailure?.timedOut ? ["The command timed out."] : undefined,
    suggestion: options.missingSuggestion,
  };
}

async function resolveCommandPath(
  runner: CommandRunner,
  command: string,
): Promise<string | undefined> {
  const isWindows = process.platform === "win32";
  const result = await runner.run(isWindows ? "where" : "which", [command], 3_000);
  if (result.exitCode === 0) {
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  }
  return undefined;
}

function nodeCheck(): DoctorCheck {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    id: "node",
    name: "Node.js",
    category: "core",
    status: major >= 20 ? "ok" : "warning",
    version: process.versions.node,
    path: process.execPath,
    suggestion: major >= 20 ? undefined : "Use Node.js 20 or newer.",
  };
}

async function inspectAndroidDevices(
  runner: CommandRunner,
): Promise<{ check: DoctorCheck; devices: AndroidDeviceSummary[] }> {
  const result = await runner.run("adb", ["devices", "-l"], 8_000);
  if (result.exitCode !== 0) {
    return {
      devices: [],
      check: {
        id: "android-device",
        name: "Android device",
        category: "android",
        status: "error",
        details: [firstLine(combinedOutput(result)) || "ADB device discovery failed."],
        suggestion: "Start the ADB server and verify USB debugging or emulator connectivity.",
      },
    };
  }

  const parsed = parseAdbDevices(result.stdout);
  const devices: AndroidDeviceSummary[] = [];

  for (const device of parsed) {
    if (device.state !== "device") {
      devices.push(device);
      continue;
    }

    const [abi, androidVersion] = await Promise.all([
      adbShellProperty(runner, device.serial, "ro.product.cpu.abi"),
      adbShellProperty(runner, device.serial, "ro.build.version.release"),
    ]);

    devices.push({ ...device, architecture: abi, androidVersion });
  }

  if (devices.length === 0) {
    return {
      devices,
      check: {
        id: "android-device",
        name: "Android device",
        category: "android",
        status: "warning",
        details: ["ADB is available, but no Android device or emulator is connected."],
        suggestion: "Connect a device with USB debugging enabled or start an emulator.",
      },
    };
  }

  const unavailable = devices.filter((device) => device.state !== "device");
  return {
    devices,
    check: {
      id: "android-device",
      name: "Android device",
      category: "android",
      status: unavailable.length === 0 ? "ok" : "warning",
      details: devices.map((device) => {
        const extras = [device.model, device.architecture, device.androidVersion]
          .filter(Boolean)
          .join(", ");
        return `${device.serial}: ${device.state}${extras ? ` (${extras})` : ""}`;
      }),
      suggestion:
        unavailable.length === 0
          ? undefined
          : "Authorize offline or unauthorized devices, then run aura doctor again.",
    },
  };
}

async function inspectFridaDevice(runner: CommandRunner): Promise<DoctorCheck> {
  const result = await runner.run("frida-ps", ["-U"], 8_000);
  if (result.exitCode === 0) {
    return {
      id: "frida-device",
      name: "Frida device connection",
      category: "frida",
      status: "ok",
      details: ["frida-ps successfully connected to the USB device."],
    };
  }

  const output = combinedOutput(result);
  const mismatch = /version|incompatible|protocol/i.test(output);
  return {
    id: "frida-device",
    name: "Frida device connection",
    category: "frida",
    status: "warning",
    details: [firstLine(output) || "frida-ps could not connect to a USB device."],
    suggestion: mismatch
      ? "Install a frida-server version compatible with the local Frida client."
      : "Start frida-server on the device and verify USB connectivity and permissions.",
  };
}

function parseAdbDevices(output: string): AndroidDeviceSummary[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("*"))
    .map((line) => {
      const [serial = "", state = "unknown", ...fields] = line.split(/\s+/);
      const model = fields.find((field) => field.startsWith("model:"))?.slice("model:".length);
      return { serial, state, model };
    });
}

async function adbShellProperty(
  runner: CommandRunner,
  serial: string,
  property: string,
): Promise<string | undefined> {
  const result = await runner.run("adb", ["-s", serial, "shell", "getprop", property]);
  const value = result.stdout.trim();
  return result.exitCode === 0 && value.length > 0 ? value : undefined;
}

function validatePythonVersion(
  result: CommandResult,
): { status: DoctorCheck["status"]; detail: string } | undefined {
  const output = combinedOutput(result);
  const match = /python\s+(\d+)\.(\d+)/i.exec(output);
  if (!match) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 3) {
    return {
      status: "warning",
      detail: "Python 2 is detected. frida-tools requires Python 3.8 or newer.",
    };
  }
  if (major === 3 && minor < 8) {
    return {
      status: "warning",
      detail: `Python ${major}.${minor} is too old. frida-tools requires Python 3.8 or newer.`,
    };
  }
  return undefined;
}

function ghidraCandidates(): Array<{ command: string; args: string[] }> {
  const candidates = [
    { command: "ghidraRun", args: ["--help"] },
    { command: "ghidraRun.bat", args: ["--help"] },
  ];
  const home = process.env.GHIDRA_HOME;
  if (home) {
    const separator = process.platform === "win32" ? "\\" : "/";
    const executable = process.platform === "win32" ? "ghidraRun.bat" : "ghidraRun";
    candidates.unshift({ command: `${home}${separator}${executable}`, args: ["--help"] });
  }
  return candidates;
}

function ghidraVersion(result: CommandResult): string | undefined {
  const output = combinedOutput(result);
  return /Ghidra\s+([\w.-]+)/i.exec(output)?.[1];
}

function firstVersion(result: CommandResult): string | undefined {
  const output = combinedOutput(result);
  return /\b(v?\d+(?:\.\d+){1,3}(?:[-+._][\w.-]+)?)\b/i.exec(output)?.[1];
}

function commandExists(result: CommandResult): boolean {
  return result.errorCode !== "ENOENT" && result.errorCode !== "UNKNOWN";
}

function combinedOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function firstLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}
