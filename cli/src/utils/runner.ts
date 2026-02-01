import { spawn, type SpawnOptions } from 'child_process';
import { join } from 'path';

/**
 * Get the root directory of the monorepo.
 */
export function getMonorepoRoot(): string {
  return process.cwd();
}

/**
 * Spawn a child process with signal forwarding and proper cleanup.
 * Forwards SIGINT/SIGTERM to the child so it can shut down gracefully.
 */
function spawnWithCleanup(
  command: string,
  args: string[],
  options: SpawnOptions,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit', shell: true, ...options });

    const forwardSignal = (signal: NodeJS.Signals) => {
      proc.kill(signal);
    };
    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    const cleanup = () => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
    };

    proc.on('close', (code) => {
      cleanup();
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      cleanup();
      reject(error);
    });
  });
}

/**
 * Run a script from the scripts directory with the given arguments.
 * Uses tsx to execute TypeScript files directly.
 */
export async function runScript(scriptName: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const scriptPath = join(root, 'scripts', scriptName);
  return spawnWithCleanup('npx', ['tsx', scriptPath, ...args], { cwd: root }, `Script ${scriptName}`);
}

/**
 * Run a script from the mcp-server/src/scripts directory.
 */
export async function runMcpScript(scriptName: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const scriptPath = join(root, 'mcp-server', 'src', 'scripts', scriptName);
  return spawnWithCleanup('npx', ['tsx', scriptPath, ...args], { cwd: join(root, 'mcp-server') }, `MCP script ${scriptName}`);
}

/**
 * Run the MCP server CLI with the given command and arguments.
 */
export async function runMcpCli(command: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const cliPath = join(root, 'mcp-server', 'src', 'cli', 'index.ts');
  return spawnWithCleanup('npx', ['tsx', cliPath, command, ...args], { cwd: join(root, 'mcp-server') }, `MCP CLI ${command}`);
}

/**
 * Run the MCP HTTP server.
 */
export async function runMcpServer(): Promise<void> {
  const root = getMonorepoRoot();
  const serverPath = join(root, 'mcp-server', 'src', 'http', 'server.ts');
  return spawnWithCleanup('npx', ['tsx', serverPath], { cwd: join(root, 'mcp-server') }, 'MCP server');
}

/**
 * Run a turbo command with the given arguments.
 */
export async function runTurbo(command: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  return spawnWithCleanup('npx', ['turbo', command, ...args], { cwd: root }, `Turbo ${command}`);
}

/**
 * Run a turbo dev command for specific apps.
 */
export async function runTurboDev(filter?: string): Promise<void> {
  const args = filter ? ['--filter', filter] : [];
  return runTurbo('dev', args);
}

/**
 * Run a script from the mcp-server/src/scraper directory.
 */
export async function runMcpScraper(scriptName: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const scriptPath = join(root, 'mcp-server', 'src', 'scraper', scriptName);
  return spawnWithCleanup('npx', ['tsx', scriptPath, ...args], { cwd: join(root, 'mcp-server') }, `MCP scraper ${scriptName}`);
}
