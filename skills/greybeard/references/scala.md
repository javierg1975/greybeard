# Scala Encoding & Enforcement Guide

Read this before encoding a domain model in a Scala codebase.

## Type Kind → Scala 3

| Kind | Encoding |
|------|---------|
| `sum` | `enum` (preferred when no type params) or `sealed trait` + cases |
| `product` | `case class` (immutable by default) |
| `opaque` | `opaque type EventId = String` + companion smart constructor |
| `phantom` | `case class Tagged[A, Tag](value: A)` — tag erased at runtime |
| `recursive` | `enum Tree[A] { case Leaf(a: A); case Branch(l: Tree[A], r: Tree[A]) }` |
| `alias` | `type EventStream = fs2.Stream[IO, Event]` |

## Known Structure → Scala

| Structure | Cats (Typelevel) | ZIO |
|-----------|-----------------|-----|
| Semigroup / Monoid / Semilattice | `given` instance via `cats.kernel` | use Cats — ZIO has no kernel TCs |
| Functor / Monad / Traverse | `given` via cats; constrain `Async[F]` for tagless | built into `ZIO`; `ZIO.foreach` |

**Tagless final vs concrete IO**: the domain model doesn't mandate either. Apply project
convention; concrete `IO` is increasingly preferred for applications.

## Effects & Resources

| Domain fact | Cats Effect 3 | ZIO 2 |
|---------|--------------|-------|
| `pure` | `IO.pure` | `ZIO.succeed` |
| `io` | `IO(...)` | `ZIO.attempt` |
| `blocking` | `IO.blocking(...)` | `ZIO.attemptBlockingIO` |
| `async` | `IO.async_` | `ZIO.async` |
| resource | `Resource.make(acquire)(release)` | `ZIO.acquireRelease` / `ZLayer` |
| error sum | `enum E`; IO error channel or `EitherT[IO, E, A]` | typed in `ZIO[R, E, A]` |

Errors stay in the effect's error channel — never `throw` (the lint channel
should ban the keyword; see below).

## Wire-Compatible Sums (the partial-iso pattern)

When a flat wire record (JSON codec, LLM tool schema, legacy format) encodes
what is semantically a sum, do NOT change the wire. Encode:

- internal `enum` with per-variant required fields,
- `encode: Sum => Flat` — total,
- `decode: Flat => Either[String, Sum]` — partial, field-precise errors,
  dropping fields the variant doesn't own (normalization).

Law (channel 3): `decode(encode(s)) == Right(s)` per variant. The flat codec
stays byte-compatible; illegal field combinations stop existing in memory.
Construct internally ONLY via variants + `encode` — and ban raw construction
of the flat type outside the codec via a lint rule (channel 2).

## Channel 2: the Linter (route laws here aggressively)

Scala's lint channel is scalafix + fatal warnings, and it expresses more of
the domain's laws than you'd expect:

- **Compiler flags**: `-Werror`, `-Wunused:all`, `-Wvalue-discard`,
  `-Wnonunit-statement` (catches discarded `Either`/`IO` results — a law
  violation the type system permits).
- **`DisableSyntax`** (`.scalafix.conf`): `noVars/noNulls/noThrows/noReturns`
  plus `regex` entries for house laws. Each entry's `message` must teach the
  idiom — it is documentation that fires in the compile loop.
- **"Single sanctioned definition site" laws** — e.g. "the blocking predicate
  is defined once": regex-ban the pattern everywhere, `// scalafix:off <id>`
  at the definition. Suppression comments must be bare
  (`// scalafix:ok DisableSyntax.var` — trailing prose breaks the parser);
  note the reported rule keys are `DisableSyntax.var` / `.null` / `.throw`,
  not the config names.
- **Typelevel rules** (`org.typelevel %% typelevel-scalafix`):
  `TypelevelUnusedIO` (a discarded IO never runs — the canonical CE3 law
  violation), `TypelevelMapSequence`, `TypelevelAs`.
- Run via `scalafixOnCompile := true` so the channel is part of compilation,
  not a separate step someone can skip.

## What `greybeard check` enforces

Run on changed `.scala` files, layered over the repo's own settings at check time (nothing is written to the build):

- `sbt --client` compile with `-Werror -Wunused:all -Wvalue-discard`.
- WartRemover errors: `Var`, `Null`, `Throw`, `AsInstanceOf`, `IsInstanceOf`, `OptionPartial`, `TryPartial`, `IterableOps`, `Return`.
- scalafix `DisableSyntax`: `noVars`, `noNulls`, `noThrows`, `noReturns`.

## Channel 3: Property Tests

| Goal | Tool |
|------|------|
| Laws for cats type classes | `cats-laws` + `discipline` — `checkAll("X.MonoidLaws", MonoidTests[X].monoid)` |
| Custom laws | ScalaCheck `forAll` / Hedgehog `property` |
| **munit projects** | `munit-scalacheck` (`ScalaCheckSuite`, `property(...)`) — check the build file first; many app codebases are munit, not a *Spec framework |
| Stateful coherence | model-based: generate command sequences, assert derived-field laws after each transition |
| Resource lifecycle | `cats-effect-testing`: verify finalizers via `IO.ref` + `Resource.use` |

Generators must come from smart constructors so only lawful values are
generated.

## Scala.js / crossProject

Types shared by JVM and JS clients live in the cross-built module
(`crossProject` with pure cross type); pure derivations over shared types
(phase classifiers, predicates) belong there too, so both platforms consume
one definition. munit cross-compiles — JS test suites run under Node with no
extra config.

## Scala 3 Idioms for Encoding

- `enum` over `sealed trait` when no type parameters; `opaque type` over
  `AnyVal` wrappers; `given`/`using` over `implicit`; `extension` methods on
  opaque types.
- Wire labels for string-coded enums are DATA, not case names — keep a single
  codec factory with explicit label pairs and round-trip tests per enum.
- Derived/denormalized fields stored on a record are caches with laws —
  recompute in exactly one function and property-test the coherence.
