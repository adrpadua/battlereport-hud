import { spawn } from 'child_process';
import { join } from 'path';

/**
 * Get the root directory of the monorepo.
 */
export function getMonorepoRoot(): string {
  return process.cwd();
}

/**
 * Run a script from the scripts directory with the given arguments.
 * Uses tsx to execute TypeScript files directly.
 */
export async function runScript(scriptName: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const scriptPath = join(root, 'scripts', scriptName);

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      cwd: root,
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptName} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Run a script from the mcp-server/src/scripts directory.
 */
export async function runMcpScript(scriptName: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const scriptPath = join(root, 'mcp-server', 'src', 'scripts', scriptName);

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      cwd: join(root, 'mcp-server'),
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MCP script ${scriptName} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Run the MCP server CLI with the given command and arguments.
 */
export async function runMcpCli(command: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();
  const cliPath = join(root, 'mcp-server', 'src', 'cli', 'index.ts');

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', cliPath, command, ...args], {
      stdio: 'inherit',
      cwd: join(root, 'mcp-server'),
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MCP CLI ${command} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Run the MCP HTTP server.
 */
export async function runMcpServer(): Promise<void> {
  const root = getMonorepoRoot();
  const serverPath = join(root, 'mcp-server', 'src', 'http', 'server.ts');

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', serverPath], {
      stdio: 'inherit',
      cwd: join(root, 'mcp-server'),
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MCP server exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Run a turbo command with the given arguments.
 */
export async function runTurbo(command: string, args: string[] = []): Promise<void> {
  const root = getMonorepoRoot();

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['turbo', command, ...args], {
      stdio: 'inherit',
      cwd: root,
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Turbo ${command} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
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

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      cwd: join(root, 'mcp-server'),
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MCP scraper ${scriptName} exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}
