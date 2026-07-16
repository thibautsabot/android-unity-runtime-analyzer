import { execFile } from "node:child_process";
import type { CommandResult, CommandRunner } from "./types.js";

interface ExecFileFailure extends Error {
  code?: string | number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

export class SystemCommandRunner implements CommandRunner {
  run(
    command: string,
    args: string[] = [],
    timeoutMs = 5_000,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          windowsHide: true,
          encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({
              command,
              args,
              exitCode: 0,
              stdout,
              stderr,
              timedOut: false,
            });
            return;
          }

          const failure = error as ExecFileFailure;
          resolve({
            command,
            args,
            exitCode: typeof failure.code === "number" ? failure.code : null,
            stdout: failure.stdout ?? stdout ?? "",
            stderr: failure.stderr ?? stderr ?? "",
            errorCode:
              typeof failure.code === "string" ? failure.code : undefined,
            timedOut: failure.killed === true,
          });
        },
      );
    });
  }
}
