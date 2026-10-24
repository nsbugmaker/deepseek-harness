/** `sidebar` namespace dictionaries for shell controls and global panels. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'sync.label': '同步官方更改',
  'sync.prompt': '同步 DSH 官方更改：先运行 D:/aiprogram/日常使用/dsh-sync.ps1 dry-run（仓库 D:/deepseek-h/deepseek-harness），把上游新提交数和冲突文件按 A/B/C 档汇报给我；若已是最新就直接说明。',
  'panels.label': '全局面板',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'sync.label': 'Sync upstream',
  'sync.prompt': 'Sync upstream DSH changes: first run D:/aiprogram/日常使用/dsh-sync.ps1 dry-run in the D:/deepseek-h/deepseek-harness repository, then report the new upstream commit count and the conflicted files grouped by tier A/B/C; say so when already up to date.',
  'panels.label': 'Global panels',
} satisfies Record<SidebarKey, string>
