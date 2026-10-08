# Agent Note: A confined command dies with 0xC0000142 when an Electron host runs the sandbox runner

Status: implemented

English | [中文](2026-10-07-confined-command-init-failure-under-electron-runner.zh.md)

## Problem

On a host without PowerShell 7, DSH resolves the shell to Windows PowerShell 5.1 — `candidatePwshPaths` keeps it as "the last-resort fallback on legacy hosts". Under any confined sandbox mode, every command the agent then runs through that shell dies before executing anything: the tool reports exit code `3221225794` (`0xC0000142`, `STATUS_DLL_INIT_FAILED`) and no output at all.

Measured on this machine (Windows 10 22H2, build 19045.2965, the Desktop development build, session policy `workspace-write`):

- The failure is stable, not intermittent: the same bare command fails before and after hours of unrelated work.
- The working directory is irrelevant (`C:\`, the checkout, and the session workspace all fail), and the shell never emits a byte on stdout or stderr.
- The identical command under a one-shot wider access (`danger-full-access`) succeeds and reports Windows PowerShell 5.1.19041 — so the shell itself, its arguments, and the tool plumbing are all fine.
- `pwsh` is absent (`where.exe pwsh` finds nothing), which is exactly the case the fallback exists for.
- The restriction is not what is broken here: a throwaway script mirroring `probe.spec.ts` and passing `command: 'cmd.exe'` to the same `AclSandbox` API initialized the sandbox and ran the confined `cmd.exe` normally — it echoed its output. The token, the grants, and the runner all work on this host; the shell executable is the variable.
- Resolution by existence hides a second, independent way to get an unusable shell. Installing the current PowerShell 7 to escape this state made things worse: 7.6.6 ships .NET 10, and since [.NET 9 marked the apphost CET-compatible by default](https://learn.microsoft.com/en-us/dotnet/core/compatibility/interop/9.0/cet-support) that host fail-fasts on this OS build with `Fatal error. Your Windows doesn't fully support CET. Please install all available Windows updates.` (exit `-2146233082`) — the shell cannot start at all, confined or not. Because the resolver's first candidate is now a file that exists, the next host start prefers that broken shell over the working 5.1 for every command.
- The shell version is not what breaks the confined path, and neither is anything the sandbox stack does on its own. After installing 7.4.20 (which starts and reports `7.4.20` / .NET 8.0.31) a confined command still failed, while the same binary confined satisfies the sandbox driven directly — the package's probe 3/3 (now really running instead of skipping), the runner suite 19/19, and the control suite 3/3. Shapes ruled out by direct measurement before the host test below: console attached vs `windowsHide` (CREATE_NO_WINDOW), piped vs inherited stdio, and the extracted vs the installed binary.
- The host process decides the outcome, and the desktop host is the failing one. The identical real-provider confined execution — `LocalSandboxProvider` + `SandboxPolicyService` + `LocalSubprocessRuntime` + `SandboxPwshExecutor`, one `echo` under `workspace-write` — succeeds under `node.exe` (`exitCode 0`, output captured) and dies with `3221225794` (`0xC0000142`, no output) under `electron.exe` run as Node. Every repository suite runs under `node.exe`, and the Desktop application runs its host under Electron, which is why those suites are green while the application cannot run a confined command at all.
- The runner process, not the host, is what breaks it. Holding the host at Electron and changing only the interpreter that runs the windows-acl runner flips the outcome: `[electron.exe, runner.js]` dies with `3221225794`, while `[node.exe, runner.js]` runs the same command with `exitCode 0` and captured output. The confined child therefore dies because an Electron-as-Node process derives the restricted token and creates it — not because Electron is somewhere in the ancestry. `DSH_SANDBOX_RUNNER_NODE` carries that interpreter, `runnerInterpreter` configures it, and the Desktop host records the runtime's own Node there at startup.
- The product's own Windows-only end-to-end suite could not report this: `packages/shell/pwsh-sandbox/tests/acl.e2e.ts` was missing `SessionProjectionRegistry`, so `SandboxPwshExecutor` never applied, `ctx.shell` stayed undefined, and both cases failed in 2–5 ms with `Cannot read properties of undefined`. Repaired, it passes — including a session-scoped case added here — and therefore exonerates the sandbox stack.

The runner is the only variable. The [Windows ACL sandbox](../../../../packages/sandbox/sandbox-windows-acl/README.md) replaces the caller's command with its argv-prefix runner, which creates a `WRITE_RESTRICTED`, Low-integrity token and spawns the wrapped command under it; the runner mirrors the confined child's exit code full-width, which is why a raw NTSTATUS is what the tool reports. Nothing in the chain reports its own error, because the child dies inside loader initialization rather than in a command.

The product already records this failure class, which is what makes the gap legible:

- The logon-SID + Everyone keep-alive group exists in the restricting list because "early DLL init dies with `0xC0000142`" without it.
- The same README lists console isolation as unavailable: `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` children "die during DLL initialization with `STATUS_DLL_INIT_FAILED`".
- The [mandatory-integrity note](../../implemented/feature/2026-09-19-windows-acl-mandatory-integrity-confinement.md) measured a stronger case: an Untrusted token "cannot start `pwsh` at all — DLL initialization fails (`0x8007045A`, `BCrypt.dll`)" — the reason Low integrity was chosen for the rung.
- The one end-to-end probe of a confined shell hardcodes `pwsh` and skips when it is missing (`describe.skipIf(!pwshAvailable())`), so the 5.1 fallback has no confined coverage anywhere.

So the confined path is verified only under a `node.exe` host, while the Desktop application runs under Electron — and under that host the confined child dies inside loader initialization.

## Workaround

The confined child starts when the process that derives its token is a real Node. `runnerInterpreter` (or `DSH_SANDBOX_RUNNER_NODE`) selects the interpreter for the platform runner prefix, and the Desktop host records the runtime's own Node there at startup; with the host still Electron, `[node.exe, runner.js]` runs a confined `echo` with `exitCode 0` where `[electron.exe, runner.js]` returns `3221225794`. Installing PowerShell 7.4 remains worthwhile for the host's own commands and for the sandbox's probe coverage, but it is not what repairs confinement. The Desktop application records that interpreter in the Host's environment, from the bundled primary runtime it launches the Host with; the Host falls back to the same runtime argument, and the `dsh` CLI tries the runtime it ships beside its support directory. The prepared project tree is *not* a carrier — only the primary runtime payload has a `dependencies/node` tree — so wiring this to the Host's first argument changes nothing at all. Candidates that carry no Node leave the environment untouched, so a non-Desktop host keeps its previous behavior.

## Decision

The sandbox no longer derives the runner prefix from the host executable. `runnerInterpreter` configures it, `DSH_SANDBOX_RUNNER_NODE` carries it, and the fallback is `process.execPath`, so a non-Desktop host keeps its previous behavior; a candidate that carries no Node changes nothing.

The Desktop application supplies the interpreter from the bundled primary runtime it already launches the Host with, and both of its Electron entry points record it: the Host from its runtime argument, the `dsh` CLI from the runtime shipped beside its support directory. The prepared project tree is never used as the carrier, because only the primary runtime payload has a `dependencies/node` tree.

The Windows-only real-provider e2e (`packages/shell/pwsh-sandbox/tests/acl.e2e.ts`) pins the chain that this defect escaped: it now composes `SessionProjectionRegistry` (without it `SandboxPwshExecutor` never applied and `ctx.shell` stayed undefined, so both cases failed in milliseconds instead of exercising anything), covers a session-scoped policy as the agent's own commands do, and passes. `packages/sandbox/sandbox-windows-acl/tests/runner-interpreter.spec.ts` pins the resolution order, and `apps/desktop-host/tests/sandbox-interpreter.spec.ts` plus `apps/desktop/tests/node-environment.spec.ts` pin the Desktop wiring.

## Deferred

Reporting instead of leaking a raw exit code is still open: when the resolved shell or the interpreter cannot run, the tool should fail with a localized message naming the executable and the mode instead of `0xC0000142` with empty output. PowerShell 5.1's standing under confinement is also still an implicit answer — either it is supported in every mode (the token needs work) or it is unsupported with a clear instruction to install PowerShell 7.

## Alternatives considered

**Treat it as a sandbox defect and widen the token.** The restricting list and the integrity level are load-bearing for the confinement boundary. The measured trigger is the creating process, not the token contents, so widening them would have traded the boundary for nothing.

**Drop the fallback and require PowerShell 7.** This was the original reading of the failure, and it did not survive measurement: with 7.4 installed the confined command failed identically, so the fallback was never the carrier. Verifying a resolved shell remains worth having on its own merits, but it is not this decision.

**Escalate to full access automatically when the confined shell cannot start.** Re-running commands unconfined would silently discard the session's file policy; the one-shot approval exists to keep that an explicit user decision.

**Blame the console-isolation flags first.** The archived [console-visibility note](../../archived/bug-fix/2026-09-16-windows-subprocess-console-visibility.md) already removed `CREATE_NO_WINDOW` from restricted creation in favor of `STARTF_USESHOWWINDOW` + `SW_HIDE`, so the flag that note records is not in this path.

**Clear the child's inherited mitigation policy.** A Chromium host sets process mitigation policies that children inherit, so the confined child was created through `STARTUPINFOEXW` with a zeroed `PROC_THREAD_ATTRIBUTE_MITIGATION_POLICY` plus the three `*ProcThreadAttributeList` bindings, applied to the restricted create path only. Implemented and measured: the patched module was confirmed loaded, and the Electron host still failed with `0xC0000142`. Inherited mitigation policy is therefore not the trigger, and the change was reverted instead of shipped as an unneeded security downgrade.

**Spawn the confined child without a Job, or from a non-Electron intermediate process.** Neither was needed once the runner interpreter turned out to be the only variable: the same Electron host succeeds with `[node.exe, runner.js]`, so neither the Job nor the ancestry is what the loader rejects.

## Testing

- A confined command runs on an Electron host when the runner interpreter is the runtime's Node, and dies with `0xC0000142` when it is the host executable — measured on the affected machine through the full provider stack (`SandboxPwshExecutor` under `workspace-write`).
- Confinement stays real under that interpreter: writes outside the granted roots are denied, a workspace write succeeds, and the child's `TEMP` is the runner's private directory.
- `probe`, `runner`, `control`, and the interpreter suites stay green, and the Windows-only real-provider e2e (`acl.e2e.ts`, including its session-scoped case) passes.

## Consequences

What it bought: confined commands run again on an Electron host — the Desktop application's only way to honour a session's file policy — without weakening the token, the ACLs, or the integrity level, and the Desktop `dsh` CLI inherits the same repair.

- A runtime payload without `dependencies/node` leaves the environment untouched, so the host silently keeps the host-executable interpreter and the failure. The wiring depends on that payload layout.
- The interpreter must be a real Node: a launcher that re-enters Electron (the Desktop `node-bin` shims do) reproduces the failure.
- This record is one machine's measurement of one Chromium build; another Electron version may not reject the child at all, so the finding stays "an Electron-as-Node runner cannot create this child here", never "Electron breaks the sandbox".
- Reverting `runnerInterpreter` to the host executable reintroduces the defect on every Electron-hosted surface — the Desktop host, its CLI, and any future Electron entry point.
