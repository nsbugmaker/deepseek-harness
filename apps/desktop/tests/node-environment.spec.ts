import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { desktopNodeEnvironment, sandboxRunnerNode } from '../src/node-environment.ts'

it('keeps private Desktop launchers out of the Host environment inherited by PTC', () => {
  const environment = { PATH: '/user/bin', HOME: '/user' }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment)).toEqual({
    ...environment, ELECTRON_RUN_AS_NODE: '1',
  })
  expect(environment).toEqual({ PATH: '/user/bin', HOME: '/user' })
})

it('provides private launchers only to package installation processes', () => {
  expect(desktopNodeEnvironment('/desktop/electron', '/desktop/bin', { PATH: '/user/bin' })).toEqual({
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_NODE_EXECUTABLE: '/desktop/electron',
    PATH: `/desktop/bin${delimiter}/user/bin`,
  })
})

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** One primary-runtime payload, optionally carrying the Node executable. */
function runtime(withNode: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'desktop-primary-runtime-'))
  roots.push(root)
  const executable = join(root, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  if (withNode) {
    mkdirSync(dirname(executable), { recursive: true })
    writeFileSync(executable, '')
  }
  return { root, executable }
}

it('records the runtime Node so a confined child can start', () => {
  const r = runtime(true)
  expect(sandboxRunnerNode(r.root)).toBe(r.executable)
  expect(desktopNodeEnvironment('/desktop/electron', undefined, { PATH: '/user/bin' }, r.root)).toEqual({
    PATH: '/user/bin', ELECTRON_RUN_AS_NODE: '1', DSH_SANDBOX_RUNNER_NODE: r.executable,
  })
})

it('leaves the environment unchanged when the runtime carries no Node', () => {
  const r = runtime(false)
  expect(sandboxRunnerNode(r.root)).toBeUndefined()
  expect(desktopNodeEnvironment('/desktop/electron', undefined, { PATH: '/user/bin' }, r.root)).toEqual({
    PATH: '/user/bin', ELECTRON_RUN_AS_NODE: '1',
  })
})
