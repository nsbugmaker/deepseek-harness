/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 *
 * The served application page paints the fish mark before any script runs, so
 * the boot page adopts that screen when it finds one: the mark stays and only
 * the progress ring and hint join it. Without one — the worker preview page, a
 * test carrier, any embedding document — it draws the complete card itself,
 * wordmark included.
 * @module @deepseek-ai/dsh-client-web/src/boot-page
 */
import type { LoaderEntryState } from './loader-status.ts'
import css from './boot-page.module.css'

/** Create a div with one module class and optional text. */
function div(className: string | undefined, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  /** The screen this page created, or undefined when it adopted the served one. */
  private readonly ownedRoot: HTMLDivElement | undefined
  private readonly card: HTMLDivElement
  /** The wordmark, present only on a self-drawn screen: an adopted mark is the brand. */
  private readonly leading: HTMLDivElement | undefined
  private readonly spinner: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly states = new Map<string, LoaderEntryState>()
  private readonly active = new Set<string>()
  private total = 0
  private failure: string | undefined

  /**
   * Build and attach the boot page.
   * @param container - Application mount point, possibly already carrying the
   * painted startup screen whose `data-dsh-boot-status` host this page fills.
   */
  constructor(container: HTMLElement) {
    const status = container.querySelector<HTMLElement>('[data-dsh-boot-status]') ?? undefined
    this.spinner = div(css.spinner)
    this.spinner.dataset.dshBootSpinner = ''
    this.hint = div(css.hint, 'Loading plugins…')
    this.card = div(css.card)
    if (status === undefined) {
      const root = div(css.boot)
      root.dataset.dshBoot = ''
      const wordmark = div(css.wordmark, 'HARNESS')
      this.leading = wordmark
      this.ownedRoot = root
      this.card.append(wordmark, this.spinner, this.hint)
      root.append(this.card)
      container.append(root)
    } else {
      this.leading = undefined
      this.ownedRoot = undefined
      this.card.append(this.spinner, this.hint)
      status.append(this.card)
    }
    this.updateProgress()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total: number): void {
    this.total = total
    this.updateProgress()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id: string, state: LoaderEntryState): void {
    this.states.set(id, state)
    if (state === 'active') this.active.add(id)
    this.updateProgress()
    this.render()
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message: string): void {
    this.failure = message
    this.render()
  }

  /**
   * Detach what this page added. A window it drew itself goes away whole; from
   * an adopted screen only its own card leaves, because the mark belongs to the
   * serving page (and the renderer clears the mount point anyway).
   */
  dispose(): void {
    if (this.ownedRoot === undefined) {
      this.card.remove()
      return
    }
    this.ownedRoot.remove()
  }

  /** Redraw the state-dependent content below the wordmark. */
  private render(): void {
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(
          ...this.leading === undefined ? [this.spinner, this.hint] : [this.leading, this.spinner, this.hint],
        )
      }
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, 'Failed to load plugins'))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    this.card.replaceChildren(...this.leading === undefined ? [report] : [this.leading, report])
  }

  /** Grow the rotating arc monotonically as loader entries activate. */
  private updateProgress(): void {
    const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1)
    this.spinner.style.setProperty('--dsh-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
  }
}
