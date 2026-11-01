# Algebra IR Specification (Language-Agnostic)

The IR is emitted as a YAML document. One document per module or bounded
context. Every field is optional unless marked **required**. Emit ONLY what
the domain requires — do not invent structure that isn't there.

Language-specific encoding guidance lives in the language profiles next to
this file (`scala.md`, `typescript.md`, `python.md`). Check a document with
`uv run scripts/validate_ir.py .algebra/<module>.algebra.md` from the skill folder.

## Module

```yaml
module:
  name: string                    # required
  purpose: string                 # one sentence: what this module does
  depends_on: [module_name]       # other modules this one references
```

## Types

```yaml
types:
  - name: string                  # required
    kind: sum | product | opaque | phantom | recursive | alias
    purpose: string
    type_params: [string]
    fields:                       # for product types
      - name: string
        type: string
        constraints: [string]     # e.g. "non-empty", "positive", "> 0"
    variants:                     # for sum types
      - name: string
        fields: [{ name, type }]
    wraps: string                 # for opaque types: the underlying type
    invariants: [string]
    notes: string
```

### Kind Reference

| Kind | Meaning |
|------|---------|
| `sum` | One of N variants (tagged union / sealed hierarchy) |
| `product` | All fields present simultaneously |
| `opaque` | Wrapper enforcing a smart constructor; underlying type hidden |
| `phantom` | Type-level marker with no runtime representation |
| `recursive` | Self-referential structure |
| `alias` | Named shorthand for another type |

## Algebras

```yaml
algebras:
  - name: string                  # required
    over: [type_name]
    purpose: string
    known_structure: string | null # Monoid, Semigroup, Group, Functor,
                                  # Applicative, Monad, Foldable, Traverse,
                                  # NaturalTransformation, Semilattice,
                                  # or null if custom
    operations:
      - name: string              # required
        signature: string         # informal: "A -> A -> A"
        description: string
        pure: bool
        total: bool
    laws:
      - name: string
        description: string
        formal: string | null
    notes: string
```

### Common Known Structures

| Structure | Key Laws |
|-----------|---------|
| Semigroup | associativity |
| Monoid | associativity + left/right identity |
| Group | Monoid + inverse |
| Functor | identity, composition |
| Applicative | Functor + identity, composition, homomorphism, interchange |
| Monad | left identity, right identity, associativity |
| Foldable | consistent fold |
| Traverse | identity, composition |
| Semilattice | associativity + commutativity + idempotency |
| NaturalTransformation | naturality |

## Effects

```yaml
effects:
  - operation: string             # Algebra.operation
    kind: pure | io | blocking | async
    description: string
    interruptible: bool | null
    idempotent: bool | null
```

### Effect Kind Reference

| Kind | Meaning |
|------|---------|
| `pure` | No side effects |
| `io` | Non-blocking I/O (network, async file, async DB) |
| `blocking` | Blocks a thread / the event loop |
| `async` | Callback-based, non-blocking |

## Resources

```yaml
resources:
  - name: string
    type: string
    acquire: string
    release: string
    acquire_blocks: bool
    release_idempotent: bool
    depends_on: [resource_name]
    notes: string
```

## Error Model

```yaml
errors:
  - name: string
    kind: sum | opaque
    scope: module | shared
    variants:
      - name: string
        fields: [{ name, type }]
        recoverable: bool
        description: string
    notes: string
```

## Blocks

```yaml
blocks:
  - name: string                  # required
    purpose: string
    types: [type_name]
    algebras: [algebra_name]
    resources: [resource_name]
    depends_on: [block_name]
    independent: bool
    complexity: low | medium | high
    notes: string
```

## Cross-Cutting Concerns

```yaml
cross_cutting:
  - concern: string               # required
    affects: [block_name]
    constraint: string
    validation_strategy: string
```
