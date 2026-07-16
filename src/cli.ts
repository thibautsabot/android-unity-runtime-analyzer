#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runInspectCommand } from "./commands/inspect.js";
import { messageOf } from "./utils.js";

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(helpText());
    return 0;
  }

  const command = argv[0];
  if (command !== "inspect" && command !== "doctor") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${helpText()}`);
    return 2;
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
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
    process.stderr.write(
      `Missing APK, XAPK or APKS path.\n\n${inspectHelpText()}`,
    );
    return 2;
  }
  if (parsed.positionals.length > 1) {
    process.stderr.write(
      `Unexpected argument: ${parsed.positionals[1]}\n\n${inspectHelpText()}`,
    );
    return 2;
  }

  try {
    const output = await runInspectCommand(input, {
      verbose: parsed.values.verbose === true,
    });
    process.stdout.write(output);
    return 0;
  } catch (error) {
    process.stderr.write(
      `AURA could not inspect the package: ${messageOf(error)}\n`,
    );
    return 1;
  }
}

function helpText(): string {
  return `AURA\n\nAndroid package inspector.\n\nUsage:\n  aura inspect <package.apk|package.xapk|package.apks> [options]\n\nCommands:\n  inspect       Detect frameworks, backends and SDKs with supporting evidence\n\nOptions:\n  -v, --verbose  Show full manifest details (permissions, activities, services, receivers, providers)\n`;
}

function inspectHelpText(): string {
  return `Usage:\n  aura inspect <package.apk|package.xapk|package.apks> [--verbose]\n`;
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
