# TypeScript Encoding & Enforcement Guide

Read this before encoding a domain model in a TypeScript codebase.

## Domain Structure → TypeScript

| Structure | Encoding options (project convention picks) |
|--------------|---------------------------------------------|
| `sum` type | discriminated union with literal `kind` tag — never class hierarchies |
| `product` type | `interface`/`type` with readonly fields; or class with private ctor + static factory |
| `opaque` type | branded type (`string & { readonly _brand: 'EventId' }`); or Zod `.brand()` |
| `phantom` type | generic phantom param (`type Validated<A> = A & { readonly _validated: true }`) |
| Monoid | plain `combine` + `empty`; or `@fp-ts/core` instance |
| Functor/Monad | fp-ts instances; Effect; or plain `map`/`flatMap` on a wrapper |
| Error sum | discriminated union; `neverthrow Result<T, E>`; or `Effect<A, E, R>` |
| Resource lifecycle | `using` / `Symbol.asyncDispose`; `Effect.acquireRelease`; or `try/finally` |

## Trust boundaries: Zod, never `typeof` guard chains

Manual guards fail silently (missing fields, array-object confusion) and end
in `as T` casts that bypass the type system. At every boundary (queue
records, API responses, env config):

```typescript
const EnvelopeSchema = z.object({
  eventId: z.string(),
  payload: z.record(z.string(), z.unknown()),   // rejects arrays
  correlationId: z.string().nullable().optional(),
});
type Envelope = z.infer<typeof EnvelopeSchema>;
const result = EnvelopeSchema.safeParse(raw);   // integrate with neverthrow err()
```

Zod v4: `z.record()` takes two args; `ZodError.issues` replaces `.errors`.

## Channel 2: the Linter

- `tsconfig` strictness IS channel 1 here — keep strict defaults, and treat
  type errors as the unrepresentability mechanism.
- **typescript-eslint** with errors fatal in the gate. Route shape laws to:
  `no-restricted-syntax` / `no-restricted-imports` (banned constructs and
  "not outside its definition site" laws — selector + message that teaches
  the idiom), `@typescript-eslint/no-floating-promises` + `no-misused-promises`
  (the discarded-effect law — TS's `TypelevelUnusedIO` equivalent),
  `switch-exhaustiveness-check` (sum dispatch totality).
- `eslint-plugin-functional` for no-mutation/no-throw regimes where the
  project wants them.
- Custom eslint rules only when a selector can't express the law — same
  promotion criterion as everywhere: regex/selector first, custom rule when
  false positives annoy.

## TypeScript 6.0+ notes for generated code

New defaults (don't set explicitly): `strict`, `esModuleInterop`,
`alwaysStrict`; `module` defaults `esnext` — **set explicitly** for Node
(`NodeNext`/`CommonJS`). Must patch: `"types": ["node"]` (default is now
empty), explicit `"rootDir"`, `moduleResolution: "nodenext"|"bundler"`
(`node10`/`classic` gone), `import ... with { type: 'json' }`,
`namespace` keyword (not `module`). Minimum target `es2015`.

Prefer: `map.getOrInsert(Computed)`, `??=`, `Temporal` over `Date`,
`RegExp.escape`, `#/` subpath imports, `using` for cleanup. HOF inference no
longer depends on property order — method syntax is safe in compositions.

## What `greybeard check` enforces

Run on changed `.ts`/`.tsx` files, layered over the repo's own config at check time (nothing is written to the project):

- `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- ESLint `functional/no-let`, `functional/immutable-data`, `functional/no-throw-statements`, `functional/no-loop-statements`, and `@typescript-eslint/switch-exhaustiveness-check`.

## No mocks at I/O boundaries

`jest.fn()` / `mockResolvedValue()` at an I/O boundary return whatever you told
them to and hide schema mismatches and wrong key names. Pure functions get plain
tests. I/O gets a real dependency (a local emulator, test credentials) or a
purpose-built stub server (`msw`). A pure pass-through layer (a middleware
stack) is the one acceptable mock. If the project has its own testing skill or
doctrine, it wins over this section.

## Channel 3: Property Tests (fast-check)

```typescript
// Associativity
fc.property(arbA, arbA, arbA, (a, b, c) =>
  deepEqual(combine(combine(a, b), c), combine(a, combine(b, c))))
// Identity
fc.property(arbA, (a) => deepEqual(combine(empty, a), a))
// Functor composition
fc.property(arbFA, arbAtoB, arbBtoC, (fa, f, g) =>
  deepEqual(map(map(fa, f), g), map(fa, x => g(f(x)))))
```

Arbitraries come from smart constructors / Zod schemas (`zod-fast-check`) so
only lawful values are generated.
