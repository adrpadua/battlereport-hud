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
