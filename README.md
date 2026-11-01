<h1 align="center">Greybeard</h1>

<p align="center">
  <em>Lazy senior dev mode that thinks in types.</em>
</p>

Greybeard is an FP-leaning derivative of [ponytail](https://github.com/DietrichGebert/ponytail) by Dietrich Gebert (MIT; see [NOTICE](NOTICE)). It keeps ponytail's core idea, the smallest change that fully solves the task, and changes what "smallest" means: a domain type, a smart constructor, a sum type parsed once at the boundary or a lawful typeclass instance counts as the minimal solution, not as an extra abstraction.

## What changed from ponytail

- **The ladder** gains a rung between the standard library and new code: an existing lawful instance or combinator (`traverse`, `foldMap`, a `Monoid`) beats a hand-written loop.
- **Errors are values.** No `throw`, `null`, reassignment or in-place mutation in domain code.
- **Laws get enforced** in the cheapest place nobody can skip: types, then compiler or linter, then a property test.
- **An Algebra IR** (`.algebra/<module>.algebra.md`) is required when a change adds or changes domain types, laws or effects. `/greybeard-review` reads it before the code and reports drift; `/greybeard-review drift <module>` runs only that check.
- **Project skills win** over greybeard's language profiles where they conflict.
- **Language profiles** for Scala, TypeScript and Python live in [`skills/greybeard/references/`](skills/greybeard/references/).
- **`greybeard check`** enforces the Scala and TypeScript profiles on changed files.

The benchmark numbers in [`benchmarks/results/`](benchmarks/results/) are ponytail's, measured on its ruleset. Greybeard's rules have not been benchmarked.

## The prompt

Greybeard is one prompt: [`skills/greybeard/SKILL.md`](skills/greybeard/SKILL.md). The compact version, for agents that read a rules file, is [`AGENTS.md`](AGENTS.md). Everything else in this repo loads that prompt into different agents.

## Install

**Claude Code**, as two separate prompts:

```
/plugin marketplace add javierg1975/greybeard
```
```
/plugin install greybeard@greybeard
```

**Codex:**

```bash
codex plugin marketplace add javierg1975/greybeard
codex plugin add greybeard@greybeard
```

**Any other agent:** copy [`AGENTS.md`](AGENTS.md) into your project, or install [`skills/greybeard/SKILL.md`](skills/greybeard/SKILL.md) as a skill. Per-agent steps: [INSTALL.md](INSTALL.md).

## Commands

| Command | What it does |
|---------|--------------|
| `/greybeard [lite \| full \| ultra \| off]` | Set the intensity, or turn it off. |
| `/greybeard band [on \| off]` | Claude Code only: hide or show the band above the prompt. |
| `/greybeard-review` | Review the current diff: bugs, security, real load, risky code without a test, slow paths, what to cut. |
| `/greybeard-audit` | The same check for the whole repo, most important first. |
| `/greybeard-debt` | Collect `shortcut:` comments into a ledger. |
| `/greybeard-gain` | Ponytail's measured benchmark scoreboard. |
| `/greybeard-help` | Quick reference. |

## `greybeard check`

One entry point that detects the language from build files (`build.sbt`, `tsconfig.json` or `package.json`), runs that profile on changed files only, and prints one `file:line rule message` per finding. Languages without a profile are skipped.

```bash
node hooks/check/index.js check                 # working-tree changes vs HEAD, plus untracked files
node hooks/check/index.js check --staged        # staged files
node hooks/check/index.js check --install-hook  # git pre-commit hook for this repo
```

In Claude Code the plugin runs it after every `Edit` or `Write` and hands findings back to the agent.

| Profile | Runs |
|---------|------|
| Scala | `sbt --client Test/compile` with `-Werror -Wunused:all -Wvalue-discard` and WartRemover errors (`Var`, `Null`, `Throw`, `AsInstanceOf`, `IsInstanceOf`, `OptionPartial`, `TryPartial`, `IterableOps`, `Return`); scalafix `DisableSyntax` (`noVars`, `noNulls`, `noThrows`, `noReturns`) when the build has sbt-scalafix. |
| TypeScript | `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; ESLint with `functional/no-let`, `functional/immutable-data`, `functional/no-throw-statements`, `functional/no-loop-statements` and `@typescript-eslint/switch-exhaustiveness-check`. |

Both profiles ship their own config and layer it over the project's at check time. Nothing is written into the project: generated config lives under `.git/greybeard/`, and the Scala flags go into the running sbt server's session (once per server start). The TypeScript profile uses the project's `typescript`, `eslint`, `typescript-eslint` and `eslint-plugin-functional`, falling back to copies installed next to greybeard.

## License

[MIT](LICENSE), with attribution in [NOTICE](NOTICE).
