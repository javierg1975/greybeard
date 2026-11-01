# Install

Pick your agent below. Not listed? Most agents read [`AGENTS.md`](AGENTS.md): copy it into your project, or ask your agent to install [`skills/greybeard/SKILL.md`](skills/greybeard/SKILL.md) as a skill. Which files map to which agent: [Agent portability](docs/agent-portability.md).

The Claude Code and Codex plugins (and the Cursor hooks) run two tiny Node.js lifecycle hooks, so `node` needs to be on your PATH (note for Nix/nvm users: it must be on the non-interactive shell's PATH). If it isn't, the skills still work, but every hook call shows a harmless `node: command not found` error; installing Node (or putting it on that PATH) makes it go away.

## Claude Code

```
/plugin marketplace add javierg1975/greybeard
```
```
/plugin install greybeard@greybeard
```
(You have to send two separate prompts for the install to work) 

Same steps in the Claude Code Desktop app's Code tab: type the two `/plugin` commands above into the prompt box, or click the **+** button next to it, choose **Plugins** → **Add plugin** to browse your configured marketplaces, and manage marketplaces from **Customize** in the sidebar.

CodeBuddy installs the same plugin with the same two `/plugin` commands and switches levels with `/greybeard ultra` and so on; it has no subagent injection.

## Codex

```bash
codex plugin marketplace add javierg1975/greybeard
codex plugin add greybeard@greybeard
```

Run `codex` and open `/hooks`, review and trust its two lifecycle hooks, and start a new thread.

This same install also covers the Codex desktop app: restart the app after installing and it picks up the plugin.

## GitHub Copilot CLI

```bash
copilot plugin marketplace add javierg1975/greybeard
copilot plugin install greybeard@greybeard
```

In an interactive Copilot CLI session, use the slash equivalents:

```
/plugin marketplace add javierg1975/greybeard
/plugin install greybeard@greybeard
```

Copilot CLI namespaces plugin commands by plugin name. For example:

```text
/greybeard:greybeard ultra
/greybeard:greybeard-review
```

## Pi agent harness

```
pi install git:github.com/javierg1975/greybeard
```

## Kimi Code

In Kimi Code, run `/plugins install https://github.com/javierg1975/greybeard`, then `/reload` or start a new session. The plugin puts [`AGENTS.md`](AGENTS.md) into the system prompt every turn and adds the six skills, which Kimi also offers as `/greybeard`, `/greybeard-review`, `/greybeard-audit`, `/greybeard-debt`, `/greybeard-gain` and `/greybeard-help`. Level switching (`/greybeard lite`) loads the skill for that turn; there is no persistent mode flag in Kimi.

## Oh My Pi (omp)

```bash
omp plugin marketplace add javierg1975/greybeard
omp plugin install greybeard@greybeard
```

omp runs greybeard's Pi extension unchanged, so the ruleset is injected every turn as in Pi (verified with omp 18.6.1). Start a new session after installing.

## OpenCode

```bash
opencode plugin add @javierg1975/greybeard
```

Or add it to a project's `opencode.json`:

```json
{ "plugins": ["@javierg1975/greybeard"] }
```

Run from a checkout instead (the plugin reuses `hooks/` and `skills/`):

```json
{ "plugins": ["./.opencode/plugins"] }
```

Injects the ruleset every turn at the active level; adds the `/greybeard` commands (see [Commands](README.md#commands)). OpenCode also auto-loads this repo's `AGENTS.md`, so the rules hold even without the plugin. The plugin adds the `lite/full/ultra/off` levels.

The `./` path resolves against your project's `opencode.json`; to share one checkout across projects, point it at the absolute path of the checkout's `.opencode/plugins` directory. A `plugins` entry must name a **directory**, not a file: OpenCode 2 rejects a path to `greybeard.mjs` with `configured plugin path must be a directory`. Opening this repo in OpenCode 2 needs no entry at all: it loads `.opencode/plugins/index.js` on its own.

Kilo Code is built on OpenCode and runs the same plugin through its `plugin` key: add `{ "plugin": ["@javierg1975/greybeard"] }` to `kilo.jsonc` (or `~/.config/kilo/kilo.jsonc` for every project).

OpenCode 1 has no `plugin add` and uses the older `plugin` key: `{ "plugin": ["@javierg1975/greybeard"] }`, or from a checkout the file path: `{ "plugin": ["./.opencode/plugins/greybeard.mjs"] }`.

## Gemini CLI

```bash
gemini extensions install https://github.com/javierg1975/greybeard
```

Loads the ruleset as always-on context every session and registers the `/greybeard` commands; the `skills/` ship too, activated when a task needs them.
The Gemini adapter intentionally does not ship a root `hooks/hooks.json`: Gemini auto-loads that path, while Greybeard's lifecycle hooks use Claude/Codex event names.

Qwen Code installs the same extension: `qwen extensions install javierg1975/greybeard:greybeard`. It loads `AGENTS.md` as always-on context and registers the `/greybeard` commands and the skills; levels don't persist across sessions, since the lifecycle hooks are not used.

## Qoder

Qoder auto-loads `AGENTS.md` from the repo root as always-on context, so running greybeard from a checkout works with zero setup. For per-project rules, copy [`.qoder/rules/greybeard.md`](.qoder/rules/greybeard.md) into your project's `.qoder/rules/`. The six greybeard skills (`/greybeard`, `/greybeard-review`, `/greybeard-audit`, `/greybeard-debt`, `/greybeard-gain`, `/greybeard-help`) are available via Qoder's Skill system; the plugin manifest at [`.qoder-plugin/plugin.json`](.qoder-plugin/plugin.json) points at the `skills/` directory.

For full plugin-tier support (automatic mode activation + ruleset injection on every prompt), install greybeard as a Qoder plugin (`qodercli plugins install <path-to-greybeard>`): the manifest loads [`hooks/qoder-hooks.json`](hooks/qoder-hooks.json) and Qoder fills in `${QODER_PLUGIN_ROOT}`. Without the plugin, copy those hooks into your `.qoder/settings.json` and replace `${QODER_PLUGIN_ROOT}` with the path to your greybeard checkout. Qoder's `UserPromptSubmit` hook activates the default mode on first prompt and injects the ruleset every turn; `PreToolUse` with `task|Task` matcher injects the ruleset into subagents. Level switches (`/greybeard lite|full|ultra|off`) work automatically.

## Antigravity CLI

```bash
agy plugin install https://github.com/javierg1975/greybeard
```

Installs the six skills, and Antigravity turns the `/greybeard` commands into skills as well, so you [call them as slash commands](https://www.antigravity.google/docs/skills#slash-command-conversion) such as `/greybeard-review`. No lifecycle hooks, so levels don't persist. For the always-on ruleset, copy [`AGENTS.md`](AGENTS.md) into your project; Antigravity [reads it as workspace rules](https://www.antigravity.google/docs/rules). Install verified with Antigravity CLI 1.3.3.

## Hermes Agent

```bash
hermes plugins install javierg1975/greybeard --enable
```

If that stops with `plugin.json declares an unsupported or missing Agent Plugins schema`, it is Hermes' install check (fix pending in [NousResearch/hermes-agent#125937](https://github.com/NousResearch/hermes-agent/pull/125937)). Until it lands, clone the plugin in by hand; Hermes loads it from `plugin.yaml` as usual (verified with Hermes Agent v0.21.7):

```bash
git clone https://github.com/javierg1975/greybeard.git ~/.hermes/plugins/greybeard
hermes plugins enable greybeard
```

Restart Hermes after installing. The plugin injects the active Greybeard mode before each LLM turn, registers the bundled skills as `greybeard:<skill>`, and adds `/greybeard`, `/greybeard-review`, `/greybeard-audit`, `/greybeard-debt`, `/greybeard-gain`, and `/greybeard-help`. In shared gateways, restrict `/greybeard` to trusted users with Hermes slash-command access controls; runtime mode is process-local.

## CodeWhale

Reads `AGENTS.md` from the project root, zero setup. Copy [`AGENTS.md`](AGENTS.md) to your project, or run `codewhale` from a checkout of this repo. That's it.

## Devin CLI

```bash
devin plugins install javierg1975/greybeard
```

Installs greybeard as a Devin plugin; skills are available as `/greybeard:greybeard`, `/greybeard:greybeard-review`, and so on.

## OpenClaw

```bash
clawhub install greybeard
```

Installs greybeard as an OpenClaw skill from ClawHub; the review, audit, debt, gain, and help skills install the same way (`clawhub install greybeard-review`, and so on). OpenClaw applies it on coding tasks and also exposes it as a `/greybeard` command. Without ClawHub, copy [`.openclaw/skills/greybeard`](.openclaw/skills/) into `~/.openclaw/skills/`.

## Grok Build

```bash
grok plugin install javierg1975/greybeard --trust
```

Enable the plugin (off by default): `/plugins` → Plugins → Space on `greybeard`, or in `~/.grok/config.toml`:

```toml
[plugins]
enabled = ["greybeard"]
```

Start a new session (or reload plugins). Skills show as `/greybeard`, `/greybeard-review`, `/greybeard-audit`, `/greybeard-debt`, `/greybeard-gain`, `/greybeard-help`. Verify with `grok inspect`. Grok can auto-invoke greybeard for coding tasks from its skill description; use `/greybeard` (or `/greybeard lite`, `/greybeard full`, `/greybeard ultra`) when activation needs to be explicit. Grok lifecycle hooks are not used because their SessionStart output cannot inject instructions.

`AGENTS.md` still works instruction-only from a checkout without the plugin.

## Goose

```bash
goose plugin install https://github.com/javierg1975/greybeard.git
```

That imports the six skills as `greybeard:greybeard`, `greybeard:greybeard-review` and so on. For the always-on rules, copy [`AGENTS.md`](AGENTS.md) to `~/.agents/AGENTS.md` (or into your project; `~/.config/goose/.goosehints` works too). Goose has no lifecycle hooks, so the levels don't persist.

## Cursor

```bash
git clone https://github.com/javierg1975/greybeard
node greybeard/scripts/cursor-hooks.js install
```

Merges two native hooks into `~/.cursor/hooks.json` (add `--project` to write `<project>/.cursor/hooks.json` instead) and keeps any hooks you already have there. The entries run `node` from that checkout, so leave it where it is or re-run the install after moving it. Cursor reloads the file on save; open a new chat and the ruleset for your default level arrives through `sessionStart`. Send `/greybeard lite`, `/greybeard full`, `/greybeard ultra` or `/greybeard off` as a plain message to switch the level for the rest of the conversation; `/greybeard` reports it. Cursor's `subagentStart` cannot inject context, so subagents run without the ruleset, and cloud agents never fire `sessionStart`. The always-on rule (`.cursor/rules/greybeard.mdc`) and the hooks are alternatives: while the rule is in a workspace the hooks inject nothing and the mode commands answer with a notice, so delete the rule to let the hooks manage the level. Contract, verification record and limitations: [docs/cursor-hooks.md](docs/cursor-hooks.md). Uninstall: `node greybeard/scripts/cursor-hooks.js uninstall`.

## Settings

Set the level for every new session with the `GREYBEARD_DEFAULT_MODE` env var (`lite`/`full`/`ultra`/`off`), or a `defaultMode` field in `~/.config/greybeard/config.json` (`%APPDATA%\greybeard\config.json` on Windows). The default is `full`.

While active, the ruleset is also injected into every subagent spawned via the Agent tool. To scope that to specific agent types (say, keep it off read-only search agents), set the `GREYBEARD_SUBAGENT_MATCHER` env var to a regex tested against the subagent's `agent_type`. It is unanchored and case-insensitive: `explore|general` matches either, `^general$` is exact, and plugin agent types look like `plugin:name`. Unset means inject into every subagent (the default); an invalid regex, or a subagent whose type the platform doesn't report, also falls back to injecting.

## Skills CLI

The [skills CLI](https://skills.sh) copies the six greybeard skills into the skills folder of many agents:

```bash
npx skills add javierg1975/greybeard
```

Pick the agent with `--agent` (for IBM Bob: `--agent bob`), take all six without asking with `--skill '*'`, and add `--global` to install for your user instead of the project. This installs the skills only; for the always-on ruleset, also add [`AGENTS.md`](AGENTS.md) or use one of the plugins above.

## Other agents (rules file only)

Cursor (rule-only alternative to the [hooks install](#cursor)), Windsurf, Cline, GitHub Copilot Chat (the VS Code, JetBrains, and Visual Studio editor extension, not the standalone [Copilot CLI](#github-copilot-cli)), Aider, Kiro, Zed, CodeWhale, Qoder: copy the matching rules file from this repo ([`.cursor/rules/`](.cursor/rules/), [`.windsurf/rules/`](.windsurf/rules/), [`.clinerules/`](.clinerules/), [`.github/copilot-instructions.md`](.github/copilot-instructions.md), [`AGENTS.md`](AGENTS.md), [`.kiro/steering/`](.kiro/steering/), [`.qoder/rules/`](.qoder/rules/)).

Kiro: copy `.kiro/steering/greybeard.md` to `~/.kiro/steering/` (global) or `.kiro/steering/` in your project.

GitHub Copilot CLI fallback (instruction-only mode): it reads `AGENTS.md` and `.github/copilot-instructions.md` in a project, or copy the rules into `~/.copilot/copilot-instructions.md` to run greybeard in every project. This path keeps always-on guidance, but does not add plugin mode switches or hooks.

VS Code with the Codex extension reads `AGENTS.md`, which this repo ships, so it works from the repo root with no setup (`~/.codex/AGENTS.md` makes Codex global).

JetBrains Junie can read `AGENTS.md` once you point it there in Settings → Tools → Junie → Project Settings → Guidelines Path (it is not automatic yet). This repo ships `AGENTS.md`; `.junie/guidelines.md` is Junie's legacy path.

Amp (Sourcegraph) reads `AGENTS.md` from the working directory and parent directories up to `$HOME`, which this repo ships, so it works with no setup (`~/.config/amp/AGENTS.md` works globally).

Jules (Google) reads `AGENTS.md` from the repository root, which this repo ships, so it picks up the ruleset with no setup.

## Uninstall

| Host | Command |
|------|---------|
| Claude Code | `/plugin remove greybeard` |
| Codex | `codex plugin remove greybeard` |
| Devin CLI | `devin plugins remove greybeard` |
| Grok Build | `grok plugin uninstall greybeard` |
| Pi agent | `pi uninstall greybeard` |
| Kimi Code | `/plugins` in Kimi Code, then remove greybeard |
| Skills CLI | `npx skills remove greybeard greybeard-audit greybeard-debt greybeard-gain greybeard-help greybeard-review` (same `--agent` / `--global` flags as the install) |
| Oh My Pi (omp) | `omp plugin uninstall greybeard@greybeard`, then `omp plugin marketplace remove greybeard` |
| OpenCode | `opencode plugin remove @javierg1975/greybeard` |
| Cursor hooks | `node scripts/cursor-hooks.js uninstall` (add `--project` for a project-level install); removes only greybeard's entries from `hooks.json` |
| Cursor rule / Windsurf / Cline / Qoder / etc. | Delete the copied rule file |

These remove the plugin's own files. They leave behind a small amount of state greybeard writes outside the plugin folder: the mode flag (`~/.claude/.greybeard-active`, or `~/.cursor/.greybeard-active` for Cursor), `~/.config/greybeard/config.json`, the statusline script copy (`~/.claude/greybeard-statusline.sh` or `.ps1`), greybeard's entries in `~/.cursor/hooks.json`, and (if you accepted the setup nudge) a `statusLine` entry in `~/.claude/settings.json`. Until they are removed, the statusline badge keeps showing the last mode. Run `node scripts/uninstall.js` to clean those up too. **Run it before the host remove command above**: the script is itself a plugin file, so removing the plugin first deletes it (or run it from a separate clone of this repo). It only removes the statusLine entry if it points at greybeard's own script, so a statusline you set up yourself is left untouched.
