import { execSync } from 'node:child_process';

const COMPOSE_DIR = '../../';

export function docker(cmd: string): string {
  try {
    return execSync(`docker ${cmd}`, { cwd: COMPOSE_DIR, encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch (err: any) {
    return err.stdout?.toString() || err.message;
  }
}

export function compose(cmd: string): string {
  return docker(`compose ${cmd}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function healthCheck(): { status: string; lastActivity: string } | null {
  try {
    const out = docker('exec mc-ingestao curl -sf http://localhost:8080/');
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export function getIngestaoLogs(lines = 5): string {
  return compose(`logs ingestao --tail ${lines}`);
}

export function isContainerRunning(name: string): boolean {
  const out = docker(`inspect -f "{{.State.Running}}" ${name}`);
  return out.includes('true');
}

export function pass(msg: string): void {
  console.log(`  ✅ ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ❌ ${msg}`);
  process.exitCode = 1;
}

export function section(title: string): void {
  console.log(`\n━━━ ${title} ━━━`);
}
