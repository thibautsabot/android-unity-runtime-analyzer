#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInspectCommand } from "./commands/inspect.js";
import type { DoctorCategory } from "./doctor/types.js";
import { messageOf } from "./utils.js";

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(helpText());
    return 0;
  }

  const [command, ...args] = argv;
  switch (command) {
    case "inspect":
      return runInspect(args);
    case "doctor":
      return runDoctorCli(args);
    default:
      process.stderr.write(`Unknown command: ${command ?? ""}\n\n${helpText()}`);
      return 2;
  }
}

async function runInspect(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(inspectHelpText());
    return 0;
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        verbose: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n\n${inspectHelpText()}`);
    return 2;
  }

  const input = parsed.positionals[0];
  if (!input) {
    process.stderr.write(`Missing APK, XAPK or APKS path.\n\n${inspectHelpText()}`);
    return 2;
  }
  if (parsed.positionals.length > 1) {
    process.stderr.write(`Unexpected argument: ${parsed.positionals[1]}\n\n${inspectHelpText()}`);
    return 2;
  }

  try {
    const output = await runInspectCommand(input, {
      verbose: parsed.values.verbose === true,
    });
    process.stdout.write(output);
    return 0;
  } catch (error) {
    process.stderr.write(`AURA could not inspect the package: ${messageOf(error)}\n`);
    return 1;
  }
}

async function runDoctorCli(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(doctorHelpText());
    return 0;
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        android: { type: "boolean", default: false },
        frida: { type: "boolean", default: false },
        native: { type: "boolean", default: false },
        unity: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n\n${doctorHelpText()}`);
    return 2;
  }

  if (parsed.positionals.length > 0) {
    process.stderr.write(`Unexpected argument: ${parsed.positionals[0]}\n\n${doctorHelpText()}`);
    return 2;
  }

  const selected: DoctorCategory[] = [
    parsed.values.android === true ? "android" : undefined,
    parsed.values.frida === true ? "frida" : undefined,
    parsed.values.native === true ? "native" : undefined,
    parsed.values.unity === true ? "unity" : undefined,
  ].filter((value): value is DoctorCategory => value !== undefined);

  const categories = selected.length > 0 ? (["core", ...selected] as DoctorCategory[]) : undefined;

  try {
    const output = await runDoctorCommand({ categories });
    process.stdout.write(output);
    return 0;
  } catch (error) {
    process.stderr.write(`AURA doctor failed: ${messageOf(error)}\n`);
    return 1;
  }
}

function helpText(): string {
  return `AURA\n\nAndroid package inspection and runtime analysis tooling.\n\nUsage:\n  aura <command> [options]\n\nCommands:\n  inspect       Detect frameworks, backends and SDKs with supporting evidence\n  doctor        Check the local Android, Frida and Unity analysis environment\n\nRun aura <command> --help for command-specific options.\n`;
}

function inspectHelpText(): string {
  return `Usage:\n  aura inspect <package.apk|package.xapk|package.apks> [--verbose]\n\nOptions:\n  -v, --verbose  Show full manifest details\n`;
}

function doctorHelpText(): string {
  return `Usage:\n  aura doctor [options]\n\nOptions:\n  --android   Check Android tools and connected devices\n  --frida     Check Frida tools and device connectivity\n  --native    Check native analysis tools (Ghidra)\n  --unity     Check Unity reverse-engineering tools\n\nWithout a category option, all checks are run.\n`;
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
