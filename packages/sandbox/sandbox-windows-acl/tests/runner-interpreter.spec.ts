/**
 * Runner-interpreter resolution for the win32 chain: the configured
 * `runnerInterpreter`, else `DSH_SANDBOX_RUNNER_NODE`, else the host
 * executable. Platform-independent (no runner is started), so it runs in every
 * CI lane including Windows. Electron in Node mode must not land in the last
 * case — as the windows-acl runner it cannot create the restricted-token child,
 * which dies inside DLL initialization with `0xC0000142`.
 */

import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'

const READ_ONLY: SandboxPolicy = { mode: 'read-only', workspaceRoot: '/ws' }
/** A real file, so the invocation takes its built-entry branch without starting the runner. */
const RUNNER_ENTRY = fileURLToPath(new URL('./runner-interpreter.spec.ts', import.meta.url))

async function interpreterFor(config: Record<string, unknown> = {}): Promise<string> {
  const ctx = new Context()
  await ctx.plugin(LocalSandboxProvider, config)
  const sandbox = ctx.sandbox as LocalSandboxProvider
  // A sole candidate is selected unprobed, so no runner process is started.
  sandbox.internals = { platform: 'win32', windowsAclRunnerEntry: RUNNER_ENTRY }
  const confined = await sandbox.confine(['cmd.exe', '/d', '/c', 'echo'], READ_ONLY)
  return confined.argv[0] as string
}

describe('win32 chain runner interpreter', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('prefers the configured runnerInterpreter over the environment and the host executable', async () => {
    vi.stubEnv('DSH_SANDBOX_RUNNER_NODE', 'C:\\from-environment\\node.exe')
    expect(await interpreterFor({ runnerInterpreter: 'C:\\from-config\\node.exe' }))
      .toBe('C:\\from-config\\node.exe')
  })

  it('uses DSH_SANDBOX_RUNNER_NODE when no interpreter is configured', async () => {
    vi.stubEnv('DSH_SANDBOX_RUNNER_NODE', 'C:\\from-environment\\node.exe')
    expect(await interpreterFor()).toBe('C:\\from-environment\\node.exe')
  })

  it('falls back to the host executable when neither is set', async () => {
    vi.stubEnv('DSH_SANDBOX_RUNNER_NODE', '')
    expect(await interpreterFor()).toBe(process.execPath)
  })
})
