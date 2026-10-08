import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { installSandboxRunnerInterpreter } from '../src/sandbox-interpreter.ts'

const roots: string[] = []
const previous = process.env.DSH_SANDBOX_RUNNER_NODE
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  if (previous === undefined) delete process.env.DSH_SANDBOX_RUNNER_NODE
  else process.env.DSH_SANDBOX_RUNNER_NODE = previous
})

/** One runtime tree, optionally carrying the Node executable the installer looks for. */
function fixture(withNode: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'desktop-sandbox-interpreter-'))
  roots.push(root)
  const executable = join(root, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  if (withNode) {
    mkdirSync(dirname(executable), { recursive: true })
    writeFileSync(executable, '')
  }
  return { root, executable }
}

it('records the runtime Node as the sandbox runner interpreter', () => {
  const f = fixture(true)
  delete process.env.DSH_SANDBOX_RUNNER_NODE
  expect(installSandboxRunnerInterpreter(f.root)).toBe(f.executable)
  expect(process.env.DSH_SANDBOX_RUNNER_NODE).toBe(f.executable)
})

it('leaves the environment untouched when the runtime carries no Node', () => {
  const f = fixture(false)
  process.env.DSH_SANDBOX_RUNNER_NODE = 'unchanged'
  expect(installSandboxRunnerInterpreter(f.root)).toBeUndefined()
  expect(process.env.DSH_SANDBOX_RUNNER_NODE).toBe('unchanged')
})

it('uses the first candidate that carries Node', () => {
  const withoutNode = fixture(false)
  const withNode = fixture(true)
  delete process.env.DSH_SANDBOX_RUNNER_NODE
  expect(installSandboxRunnerInterpreter(withoutNode.root, withNode.root)).toBe(withNode.executable)
  expect(process.env.DSH_SANDBOX_RUNNER_NODE).toBe(withNode.executable)
})
