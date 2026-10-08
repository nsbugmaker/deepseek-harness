# Agent Note: 当 Electron 宿主运行沙箱 runner 时，受限命令以 0xC0000142 死亡

Status: implemented

[English](2026-10-07-confined-command-init-failure-under-electron-runner.md) | 中文

## Problem

在没有安装 PowerShell 7 的机器上，DSH 会把 shell 解析为 Windows PowerShell 5.1——`candidatePwshPaths` 把它保留为「旧式主机的最后回退」。而在任何受限沙箱模式下，代理通过该 shell 执行的每条命令都在真正运行前就死掉：工具报告退出码 `3221225794`（`0xC0000142`，`STATUS_DLL_INIT_FAILED`），且完全没有任何输出。

在本机（Windows 10 22H2、build 19045.2965、Desktop 开发构建、会话策略 `workspace-write`）上的实测：

- 稳定复现，不是偶发：同一条最简单的命令，在数小时无关工作前后都以同样方式失败。
- 工作目录无关（`C:\`、checkout、会话工作区都失败），shell 从未向 stdout 或 stderr 写出一个字节。
- 同一条命令用一次性放宽权限（`danger-full-access`）执行即成功，并报告 Windows PowerShell 5.1.19041——可见 shell 本身、参数与工具链路都没有问题。
- 本机没有 `pwsh`（`where.exe pwsh` 找不到任何东西），而这正是该回退存在的场景。
- 坏掉的并不是受限本身：一个镜像 `probe.spec.ts`、把 `command: 'cmd.exe'` 传给同一个 `AclSandbox` API 的临时脚本，成功初始化了沙箱，并在受限下正常跑起了 `cmd.exe`——它把输出打了出来。令牌、授权与 runner 在本机都工作正常；变量落在 shell 可执行文件上。
- 「按路径存在性解析」还藏着第二种、彼此独立的失败方式。为了摆脱上面的状态去装当前版 PowerShell 7，结果更糟：7.6.6 随包 .NET 10，而自 [.NET 9 起 apphost 默认标记为 CET 兼容](https://learn.microsoft.com/en-us/dotnet/core/compatibility/interop/9.0/cet-support)，于是在本机这个 OS 版本上直接 fail-fast —— `Fatal error. Your Windows doesn't fully support CET. Please install all available Windows updates.`（退出码 `-2146233082`）——这个 shell 无论受不受限都根本起不来。由于解析器的第一顺位现在是一个**确实存在**的文件，下一次主机启动会让它顶替原本可用的 5.1，作用于每一条命令。
- 出问题的既不是 shell 版本，也不是沙箱栈自身的任何动作。装上能启动的 7.4.20（报告 `7.4.20` / .NET 8.0.31）之后受限命令仍然失败，而同一个二进制在**直接驱动沙箱**时完全满足要求——该包探针 3/3（现在是真的跑）、runner 套件 19/19、control 套件 3/3。在下面的宿主对照之前，已被直接测量排除的形态包括：有控制台 vs `windowsHide`（CREATE_NO_WINDOW）、管道 vs 继承 stdio、解包副本 vs 安装副本。
- **决定结果的是宿主进程，而桌面端正是失败的那种宿主。** 完全相同的真 provider 受限执行——`LocalSandboxProvider` + `SandboxPolicyService` + `LocalSubprocessRuntime` + `SandboxPwshExecutor`，在 `workspace-write` 下跑一条 `echo`——在 `node.exe` 下成功（`exitCode 0`、有输出），在 `electron.exe`（RunAs Node）下以 `3221225794`（`0xC0000142`、无输出）死亡。仓库所有套件都跑在 `node.exe` 下，而桌面应用把宿主跑在 Electron 下——这正是"套件全绿、应用完全跑不了受限命令"的原因。
- 产品自带的 Windows-only 端到端套件无法报告这件事：`packages/shell/pwsh-sandbox/tests/acl.e2e.ts` 缺了 `SessionProjectionRegistry`，`SandboxPwshExecutor` 因此从未挂载、`ctx.shell` 永远是 undefined，两个用例都在 2–5ms 内以 `Cannot read properties of undefined` 失败。修好之后它通过——包括本次新增的"带会话身份"用例——因此它也为整条沙箱栈洗清了责任。
- **关键在于 runner 进程本身，而不是宿主。** 把宿主固定在 Electron、只更换运行 windows-acl runner 的解释器，结果就翻转：`[electron.exe, runner.js]` 以 `3221225794` 死亡，而 `[node.exe, runner.js]` 用 `exitCode 0` 跑完同一条命令并带回输出。因此受限子进程之所以死，是因为**由 Electron-as-Node 进程去派生受限令牌并创建它**，而不是因为祖先里出现了 Electron。`DSH_SANDBOX_RUNNER_NODE` 承载这个解释器，`runnerInterpreter` 配置它，桌面宿主在启动时把运行时自带的 Node 记进去。

唯一的变量就是 runner 本身。[Windows ACL 沙箱](../../../../packages/sandbox/sandbox-windows-acl/README.zh.md)会把调用方的命令替换为自己的 argv 前缀 runner，由它创建 `WRITE_RESTRICTED` 的 Low 完整性令牌并在其下拉起被包裹的命令；runner 按全宽镜像受限子进程的退出码，因此工具最终拿到的就是一个裸 NTSTATUS。链路中没有任何一环报告自己的错误，因为子进程是死在加载器初始化里，而不是死在命令里。

产品其实已经记录过这条失效模式，所以这个缺口是可读的：

- 限制列表里那组 登录 SID + Everyone 保活组之所以存在，正是因为缺少它时「早期 DLL 初始化会以 `0xC0000142` 死亡」。
- 同一份 README 把控制台隔离列为不可用：`CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` 子进程「会在 DLL 初始化期间以 `STATUS_DLL_INIT_FAILED` 死亡」。
- [强制完整性笔记](../../implemented/feature/2026-09-19-windows-acl-mandatory-integrity-confinement.zh.md)测过更极端的一档：Untrusted 令牌「根本无法启动 `pwsh`——DLL 初始化失败（`0x8007045A`，`BCrypt.dll`）」，这正是该档选择 Low 完整性的原因。
- 唯一针对受限 shell 的端到端探针硬编码了 `pwsh`，缺它时直接跳过（`describe.skipIf(!pwshAvailable())`），因此 5.1 这条回退路径在任何地方都没有受限场景的覆盖。

也就是说：受限路径只在 `node.exe` 宿主下被验证过，而桌面应用跑在 Electron 宿主下；在那样的宿主里，受限子进程在加载器初始化阶段就死亡。

## Workaround

当派生令牌的那个进程是真正的 Node 时，受限子进程就能启动。`runnerInterpreter`（或 `DSH_SANDBOX_RUNNER_NODE`）用来选择平台 runner 前缀的解释器，桌面宿主在启动时把运行时自带的 Node 记进去；在宿主仍是 Electron 的情况下，`[node.exe, runner.js]` 跑受限 `echo` 得到 `exitCode 0`，而 `[electron.exe, runner.js]` 返回 `3221225794`。装 PowerShell 7.4 对宿主自身的命令与沙箱探针覆盖仍然值得，但它并不是修复受限的东西。桌面应用会把这个解释器写进宿主的环境，来源是它用来启动宿主的那个捆绑主运行时；宿主自身则回退到同一个运行时参数，`dsh` CLI 会尝试它随支持目录分发的运行时。**准备好的项目树不是载体**——只有主运行时载荷里有 `dependencies/node` 树——所以把接线指向宿主的第一个参数等于什么都没改。不携带 Node 的候选目录不会改动环境，因此非桌面宿主保持原有行为。

## Decision

沙箱不再用宿主可执行文件派生 runner 前缀。`runnerInterpreter` 配置它、`DSH_SANDBOX_RUNNER_NODE` 承载它，回退值是 `process.execPath`，因此非桌面宿主保持原有行为；不携带 Node 的候选目录不会改动任何东西。

桌面应用从它本来就用来启动宿主的那个捆绑主运行时里取这个解释器，两个 Electron 入口都会记录它：宿主用它的运行时参数，`dsh` CLI 用随支持目录分发的运行时。**准备好的项目树永远不作为载体**，因为只有主运行时载荷里有 `dependencies/node` 树。

Windows-only 真链路 e2e（`packages/shell/pwsh-sandbox/tests/acl.e2e.ts`）钉住了这个缺陷得以漏过的那条链路：它现在组合了 `SessionProjectionRegistry`（缺它时 `SandboxPwshExecutor` 从未挂载、`ctx.shell` 永远是 undefined，两个用例都在毫秒级失败而不是真的跑任何东西），覆盖了代理命令所用的带会话身份策略，并且通过。`packages/sandbox/sandbox-windows-acl/tests/runner-interpreter.spec.ts` 钉住解析顺序，`apps/desktop-host/tests/sandbox-interpreter.spec.ts` 与 `apps/desktop/tests/node-environment.spec.ts` 钉住桌面接线。

## Deferred

「报错而不是泄漏裸退出码」仍然待办：当解析出的 shell 或解释器无法运行时，工具应给出点名可执行文件与模式的本地化失败信息，而不是 `0xC0000142` 加空输出。PowerShell 5.1 在受限下的地位也仍是隐含答案——要么它在所有模式下受支持（那令牌需要改造），要么它不受支持并明确提示安装 PowerShell 7。

## Alternatives considered

**当成沙箱缺陷并放宽令牌。** 限制列表与完整性级别是受限边界自身的承重结构。实测出的触发点是**创建子进程的那个进程**，而不是令牌内容，所以放宽它们等于白白拿边界去交换。

**去掉回退、强制要求 PowerShell 7。** 这是本笔记最初对失败的解读，但它没有经受住实测：装上 7.4 之后受限命令照样失败，回退从来不是载体。「验证解析出的 shell」本身仍然值得做，但它不是本决策。

**受限 shell 起不来时自动升级到完全权限。** 那会让命令在用户不知情的情况下脱离本会话的文件策略；一次性批准机制的存在，正是为了让这件事始终是用户的显式决定。

**先把责任归给控制台隔离标志。** 归档的[控制台可见性笔记](../../archived/bug-fix/2026-09-16-windows-subprocess-console-visibility.md)已经把 `CREATE_NO_WINDOW` 从受限创建里去掉，改用 `STARTF_USESHOWWINDOW` + `SW_HIDE`，所以该笔记记录的那个标志不在本路径上。

**清零子进程继承的缓解策略。** Chromium 宿主会设置会被子进程继承的进程缓解策略，因此受限子进程改为经 `STARTUPINFOEXW` + 清零的 `PROC_THREAD_ATTRIBUTE_MITIGATION_POLICY` 创建（另加三个 `*ProcThreadAttributeList` 绑定），且只作用于受限创建路径。**已实现并实测**：补丁模块确认已被加载，而 Electron 宿主依然以 `0xC0000142` 失败。因此「继承的缓解策略」不是触发点，该改动已回滚，而不是作为无必要的安全降级留在代码里。

**让受限子进程不进 Job，或改由非 Electron 的中间进程创建。** 一旦确认唯一的变量是 runner 解释器，这两条都不必要：同一个 Electron 宿主在 `[node.exe, runner.js]` 下就能成功，说明加载器拒绝的既不是 Job 也不是祖先链。

## Testing

- 在 Electron 宿主上，当 runner 解释器是运行时的 Node 时受限命令可执行；当它是宿主可执行文件时以 `0xC0000142` 死亡——本机已通过完整 provider 栈（`SandboxPwshExecutor`，`workspace-write`）实测。
- 该解释器下受限依然是真的：授权根之外的写入被拒、工作区写入成功、子进程的 `TEMP` 是 runner 的私有目录。
- `probe`、`runner`、`control` 与解释器解析套件保持绿色，且 Windows-only 真链路 e2e（`acl.e2e.ts`，含带会话身份用例）通过。

## Consequences

它买到的东西：Electron 宿主上的受限命令重新可用——那是桌面应用兑现会话文件策略的唯一方式——而且没有放宽令牌、ACL 或完整性级别，桌面 `dsh` CLI 也自动继承了同一修复。

- 运行时载荷里没有 `dependencies/node` 时环境不会被改动，宿主就会静默保留宿主可执行文件作为解释器并继续失败。因此接线依赖该载荷布局。
- 解释器必须是真正的 Node：任何会重新进入 Electron 的启动器（桌面上的 `node-bin` 垫片就是）都会复现该失败。
- 本记录只是**一台机器、一个 Chromium 版本**上的测量；另一个 Electron 版本或许根本不会拒绝该子进程，所以结论应表述为「在本机，Electron-as-Node 的 runner 创建不了这个子进程」，而不是「Electron 弄坏了沙箱」。
- 把 `runnerInterpreter` 改回宿主可执行文件，会在每一个 Electron 宿主表面上重新引入该缺陷——桌面宿主、它的 CLI，以及未来任何 Electron 入口。
