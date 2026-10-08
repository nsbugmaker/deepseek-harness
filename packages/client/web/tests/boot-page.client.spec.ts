// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BootPage } from '../src/boot-page.ts'

afterEach(() => { document.body.innerHTML = '' })

function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  return { el, page: new BootPage(el) }
}

/** Mount over the screen the served page paints before any script runs. */
function mountAdopted() {
  const el = document.createElement('div')
  const splash = document.createElement('div')
  splash.setAttribute('data-dsh-boot-splash', '')
  const status = document.createElement('div')
  status.setAttribute('data-dsh-boot-status', '')
  splash.append(status)
  el.append(splash)
  document.body.append(el)
  return { el, status, page: new BootPage(el) }
}

describe('BootPage', () => {
  it('draws the loading skeleton before any plugin state arrives', () => {
    const { el } = mount()
    expect(el.firstElementChild?.getAttribute('data-dsh-boot')).toBe('')
    expect(el.textContent).toContain('HARNESS')
    expect(el.textContent).toContain('Loading plugins…')
  })

  it('keeps loading while entries are active or loading', () => {
    const { el, page } = mount()
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'loading')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBe(spinner)
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('Loading plugins…')
    expect(el.textContent).not.toContain('Failed to load plugins')
  })

  it('lists failed entries', () => {
    const { el, page } = mount()
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    page.setState('@deepseek-ai/dsh-client-ui-tool', 'failed')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-tool')
    expect(el.textContent).not.toContain('ok')
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('shows the complete sweep report', () => {
    const { el, page } = mount()
    const report = 'web boot: 1 entry did not activate\nx: pending (waiting for service: y)'
    page.fail(report)
    page.setState('a', 'active')
    expect(el.textContent).toContain(report)
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('detaches on disposal', () => {
    const { el, page } = mount()
    page.dispose()
    expect(el.childNodes).toHaveLength(0)
  })
})

describe('BootPage over the painted startup screen', () => {
  it('adds the progress ring and hint to the mark the page already painted', () => {
    const { el, status } = mountAdopted()
    // The served screen keeps the mark; the boot page draws no second one.
    expect(el.querySelector('[data-dsh-boot]')).toBeNull()
    expect(el.querySelector('[data-dsh-boot-splash]')).not.toBeNull()
    expect(status.querySelector('[data-dsh-boot-spinner]')).not.toBeNull()
    expect(status.textContent).toContain('Loading plugins…')
    expect(el.textContent).not.toContain('HARNESS')
  })

  it('keeps reporting progress and failures under the mark', () => {
    const { el, status, page } = mountAdopted()
    page.setTotal(2)
    const spinner = status.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'failed')
    expect(status.textContent).toContain('Failed to load plugins')
    expect(status.textContent).toContain('b')
    expect(status.textContent).not.toContain('Loading plugins…')
    expect(el.querySelector('[data-dsh-boot-splash]')).not.toBeNull()
    // A failure that clears restores the trimmed card: ring and hint, no wordmark.
    page.setState('b', 'active')
    expect(status.querySelector('[data-dsh-boot-spinner]')).not.toBeNull()
    expect(status.textContent).toContain('Loading plugins…')
    expect(status.textContent).not.toContain('HARNESS')
  })

  it('detaches only its own card, leaving the page its mark', () => {
    const { el, page } = mountAdopted()
    page.dispose()
    expect(el.querySelector('[data-dsh-boot-splash]')).not.toBeNull()
    expect(el.textContent).not.toContain('Loading plugins…')
  })
})
