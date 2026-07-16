import assert from "node:assert/strict";
import test from "node:test";
import { runDoctor } from "../src/doctor/doctor.js";
import type { CommandResult, CommandRunner } from "../src/doctor/types.js";
import { renderDoctorReport } from "../src/commands/doctor.js";

class FakeRunner implements CommandRunner {
  constructor(
    private readonly responses: Record<string, Partial<CommandResult>>,
  ) {}

  async run(command: string, args: string[] = []): Promise<CommandResult> {
    const key = [command, ...args].join(" ");
    const response = this.responses[key];
    return {
      command,
      args,
      exitCode: response?.exitCode ?? null,
      stdout: response?.stdout ?? "",
      stderr: response?.stderr ?? "",
      errorCode: response?.errorCode ?? (response ? undefined : "ENOENT"),
      timedOut: response?.timedOut ?? false,
    };
  }
}

test("doctor reports tools and connected Android devices", async () => {
  const runner = new FakeRunner({
    "java -version": { exitCode: 0, stderr: 'openjdk version "21.0.4"' },
    "adb version": {
      exitCode: 0,
      stdout: "Android Debug Bridge version 1.0.41",
    },
    "adb devices -l": {
      exitCode: 0,
      stdout:
        "List of devices attached\nemulator-5554 device product:sdk model:Pixel_8 device:emu\n",
    },
    "adb -s emulator-5554 shell getprop ro.product.cpu.abi": {
      exitCode: 0,
      stdout: "arm64-v8a\n",
    },
    "adb -s emulator-5554 shell getprop ro.build.version.release": {
      exitCode: 0,
      stdout: "15\n",
    },
    "jadx --version": { exitCode: 0, stdout: "1.5.1\n" },
    "apktool --version": { exitCode: 0, stdout: "2.10.0\n" },
  });

  const report = await runDoctor({ categories: ["core", "android"] }, runner);
  assert.equal(report.devices[0]?.serial, "emulator-5554");
  assert.equal(report.devices[0]?.architecture, "arm64-v8a");
  assert.equal(report.checks.find((check) => check.id === "adb")?.status, "ok");
  assert.equal(
    report.checks.find((check) => check.id === "android-device")?.status,
    "ok",
  );
});

test("doctor reports missing tools without throwing", async () => {
  const report = await runDoctor({ categories: ["frida"] }, new FakeRunner({}));

  assert.equal(
    report.checks.find((check) => check.id === "frida")?.status,
    "missing",
  );
  assert.equal(
    report.checks.find((check) => check.id === "frida-device")?.status,
    "missing",
  );
});
