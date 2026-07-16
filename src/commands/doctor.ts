import { runDoctor } from "../doctor/doctor.js";
import type {
  DoctorCategory,
  DoctorCheck,
  DoctorReport,
} from "../doctor/types.js";

export interface DoctorCommandOptions {
  categories?: DoctorCategory[];
}

export async function runDoctorCommand(
  options: DoctorCommandOptions = {},
): Promise<string> {
  const report = await runDoctor({ categories: options.categories });
  return renderDoctorReport(report);
}

export function renderDoctorReport(report: DoctorReport): string {
  const c = colors();
  const lines: string[] = [];

  lines.push(c.bold("AURA Doctor"));
  lines.push(
    c.dim(
      `Environment diagnostics for ${report.platform}/${report.architecture}.`,
    ),
  );
  lines.push("");

  const categories: Array<{ id: DoctorCategory; label: string }> = [
    { id: "core", label: "Core" },
    { id: "android", label: "Android" },
    { id: "frida", label: "Frida" },
    { id: "native", label: "Native analysis" },
    { id: "unity", label: "Unity tooling" },
  ];

  for (const category of categories) {
    const checks = report.checks.filter(
      (check) => check.category === category.id,
    );
    if (checks.length === 0) continue;
    section(lines, category.label, c);
    for (const check of checks) renderCheck(lines, check, c);
  }

  section(lines, "Summary", c);
  lines.push(
    `${c.green(`${report.summary.ok} OK`)}  ${c.yellow(`${report.summary.warnings} warnings`)}  ${c.dim(`${report.summary.missing} missing`)}  ${c.red(`${report.summary.errors} errors`)}`,
  );

  return `${lines.join("\n")}\n`;
}

function renderCheck(
  lines: string[],
  check: DoctorCheck,
  c: ReturnType<typeof colors>,
): void {
  const marker =
    check.status === "ok"
      ? c.green("✓")
      : check.status === "warning"
        ? c.yellow("!")
        : check.status === "error"
          ? c.red("✗")
          : c.dim("-");
  const status =
    check.status === "ok"
      ? c.green("OK")
      : check.status === "warning"
        ? c.yellow("WARNING")
        : check.status === "error"
          ? c.red("ERROR")
          : c.dim("MISSING");

  const version = check.version ? ` ${c.dim(check.version)}` : "";
  lines.push(`${marker} ${check.name.padEnd(24, " ")} ${status}${version}`);
  if (check.path) lines.push(`  ${c.dim(check.path)}`);
  for (const detail of check.details ?? []) lines.push(`  ${detail}`);
  if (check.suggestion) lines.push(`  ${c.cyan("→")} ${check.suggestion}`);
}

function section(
  lines: string[],
  title: string,
  c: ReturnType<typeof colors>,
): void {
  if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
  lines.push(c.bold(title));
  lines.push(c.dim("-".repeat(Math.max(12, title.length))));
}

function colors() {
  const wrap =
    (code: number) =>
    (value: string): string =>
      `\u001b[${code}m${value}\u001b[0m`;
  return {
    bold: wrap(1),
    dim: wrap(2),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    cyan: wrap(36),
  };
}
