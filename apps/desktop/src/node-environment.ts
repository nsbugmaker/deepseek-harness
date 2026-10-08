/** Electron Node-mode startup, with private shell launchers scoped to package installation. */

import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * The sandbox's platform runner prefix starts with an interpreter that creates
 * the confined child. Electron in Node mode can run JavaScript itself, but as
 * that interpreter it cannot create a restricted-token child: the child dies
 * inside DLL initialization with `0xC0000142` before the command runs. The
 * primary runtime already carries the Node executable to use instead.
 * @param primaryRuntime - Bundled dependency payload of the current application.
 * @returns the Node executable to record, or undefined when the payload has none.
 */
export function sandboxRunnerNode(primaryRuntime: string): string | undefined {
  const executable = join(primaryRuntime, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  return existsSync(executable) ? executable : undefined
}

/**
 * Select Electron's Node mode and the shell launcher used by package scripts,
 * plus the sandbox runner interpreter when the bundled runtime carries one.
 * @param executable - Electron executable running the application.
 * @param bin - Directory containing the node shell launcher.
 * @param environment - Caller environment preserved for plugin execution.
 * @param primaryRuntime - Optional bundled dependency payload carrying Node.
 * @returns Environment for a Node-mode child process.
 */
export function desktopNodeEnvironment(
  executable: string,
  bin: string | undefined,
  environment: NodeJS.ProcessEnv,
  primaryRuntime?: string,
): NodeJS.ProcessEnv {
  const runnerNode = primaryRuntime === undefined ? undefined : sandboxRunnerNode(primaryRuntime)
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    ...(bin === undefined ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${bin}${delimiter}${environment.PATH ?? ''}` }),
    ...(runnerNode === undefined ? {} : { DSH_SANDBOX_RUNNER_NODE: runnerNode }),
  }
}
