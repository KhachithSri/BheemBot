import { spawn, type ChildProcess } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const children: ChildProcess[] = [];

function start(name: string, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });

  child.stdout?.on("data", (data: Buffer) => process.stdout.write(`[${name}] ${data}`));
  child.stderr?.on("data", (data: Buffer) => process.stderr.write(`[${name}] ${data}`));
  child.on("error", (error) => console.error(`[${name}] failed to start: ${error.message}`));
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });

  children.push(child);
  return child;
}

const node = process.execPath;
start("next", node, ["node_modules/next/dist/bin/next", "dev"]);
start("voice", node, ["--import", "tsx", "server/local-voice-relay.ts"]);

function shutdown(): void {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

for (const child of children) {
  child.once("exit", (code) => {
    if (code && code !== 0) shutdown();
  });
}
