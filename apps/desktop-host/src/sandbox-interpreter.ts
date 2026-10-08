/**
 * The sandbox's platform runner prefix starts with an interpreter that creates
 * the confined child. Electron in Node mode can run its own JavaScript, but as
 * that interpreter it cannot create a restricted-token child: the child dies
 * inside DLL initialization with `0xC0000142` before the command runs. Point
 * the prefix at the real Node the Desktop runtime already carries.
 * @module
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Select the runtime's own Node executable as the sandbox runner interpreter.
 * Candidates are tried in order — each entry is a runtime directory whose
 * `dependencies` tree may carry Node — and the environment is left untouched
 * when none of them does, so a host without one keeps its previous
 * (host-executable) behavior.
 * @param runtimeDirs - Candidate runtime directories, most specific first.
 * @returns the executable recorded for the sandbox, or undefined when absent.
 */
export function installSandboxRunnerInterpreter(...runtimeDirs: string[]): string | undefined {
  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  for (const runtimeDir of runtimeDirs) {
    const executable = join(runtimeDir, 'dependencies', 'node', 'bin', name)
    if (!existsSync(executable)) continue
    process.env.DSH_SANDBOX_RUNNER_NODE = executable
    return executable
  }
  return undefined
}
