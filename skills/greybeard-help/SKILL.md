---
name: greybeard-help
description: >
  Quick reference for greybeard levels, skills and commands. One-shot display.
  Use for /greybeard-help, "greybeard help", "how do I use greybeard".
---

# Greybeard Help

Display this reference card when invoked. One-shot, do NOT change mode,
write flag files, or persist anything.

## Levels

| Level | Trigger | What change |
|-------|---------|-------------|
| **Lite** | `/greybeard lite` | Build what was asked, name the smaller option in one line. |
| **Full** | `/greybeard` | The smallest complete change, a check where the logic needs one, and a reply that names what was skipped and any risk. Default. |
| **Ultra** | `/greybeard ultra` | Also questions the request and pushes back before building. |

Level sticks until changed or session end.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **greybeard** | `/greybeard` | Lazy mode itself: least new code, clear replies that name skipped work and risks. |
| **greybeard-review** | `/greybeard-review` | Quality review of a diff: bugs, security, load, missing tests, speed, what to cut. Each finding says what goes wrong and how to fix it. Checks code against its `.algebra/` IR blind first; `/greybeard-review drift <module>` runs only that. |
| **greybeard-audit** | `/greybeard-audit` | The same quality review for the whole repo, ranked. |
| **greybeard-debt** | `/greybeard-debt` | Harvest `shortcut:` comments into a tracked ledger. |
| **greybeard-help** | `/greybeard-help` | This card. |

`greybeard check` (CLI and Claude Code hook): runs the Scala or TypeScript profile on changed
files and prints `file:line rule message`. In Claude Code it runs after every Edit or Write;
`greybeard check --install-hook` adds it as a git pre-commit hook.

In Codex CLI and the IDE extension, invoke skills with `$greybeard:greybeard`,
`$greybeard:greybeard-review`, or `$greybeard:greybeard-help`. Claude Code and OpenCode use the
slash-command forms above (OpenCode ships all six as slash commands).

## Deactivate

Say "stop greybeard" or "normal mode". Resume anytime with `/greybeard`.
`/greybeard off` also works.

## Band (Claude Code)

`/greybeard band` hides the band above the prompt, the same command brings it back.
`/greybeard band on` and `/greybeard band off` set it directly. The level stays.
`/greybeard band import` adds your past Claude Code sessions (cost, agent time, tokens) to the board.

## Configure Default Mode

Default mode = `full`, auto-active every session. Change it:

**Environment variable** (highest priority):
```bash
export GREYBEARD_DEFAULT_MODE=ultra
```

**Config file** (`~/.config/greybeard/config.json`, Windows: `%APPDATA%\greybeard\config.json`):
```json
{ "defaultMode": "lite" }
```

Set `"off"` to disable auto-activation on session start, activate manually
with `/greybeard` when wanted.

Resolution: env var > config file > `full`.

## Update

Enable auto-update once: open `/plugin`, go to Marketplaces, pick greybeard, Enable auto-update. Claude Code then pulls new versions at startup (run `/reload-plugins` when it prompts). Manual refresh: `/plugin marketplace update greybeard` then `/reload-plugins`.

If `/plugin` is not recognized, your Claude Code is out of date. Update it (`npm install -g @anthropic-ai/claude-code@latest`, or `brew upgrade claude-code`) and restart. Other hosts use their own update flow.

## More

Full docs + examples: https://github.com/javierg1975/greybeard
