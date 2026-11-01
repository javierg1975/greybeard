# Python Encoding & Enforcement Guide

Read this before encoding a domain model in a Python codebase.

## Domain Structure → Python

| Structure | Plain Python | With FP libraries |
|--------------|-------------|------------------|
| `sum` type | `Union[X, Y]` + `match` (3.10+) | `returns.Maybe`, `returns.Result` for common cases |
| `product` type | `@dataclass(frozen=True)` | `pydantic.BaseModel` with `frozen=True` |
| `opaque` type | `NewType` (no runtime enforcement) | Pydantic custom type; or `beartype` + `NewType` |
| `phantom` type | `Generic[A, Tag]` with `Tag` unused | same |
| Monoid | plain `combine(a, b)` + `empty()` functions | explicit functions are idiomatic — no stdlib TC |
| Functor/Monad | `map` method on a wrapper class | `returns.Maybe/Result/IO/Future` |
| Error sum | `Union[X, Y]` | `returns.Result[A, E]` |
| Resource lifecycle | `contextlib.contextmanager` / `asynccontextmanager` | same — native support is good |
| Blocking effect | `concurrent.futures.ThreadPoolExecutor` | `returns.future.Future` |

## Exhaustive dispatch (`match` + `assert_never`)

Python's `match` is NOT checked for exhaustiveness by itself. Always emit the
guard — this promotes exhaustiveness from convention to **channel 1 (types)**
under mypy/pyright:

```python
from typing import assert_never

match result:
    case Written(count=n): ...
    case Failed(reason=e): ...
    case _ as unreachable:
        assert_never(unreachable)
```

## Channel 2: the Linter

- **Type checker as ratchet**: `mypy --strict` / pyright strict in the gate,
  warnings fatal. `assert_never` + strict mode is the unrepresentability
  channel Python actually has.
- **ruff**: enable `B` (bugbear — mutable defaults!), `RET`, `TRY`
  (exception-flow laws); ban patterns via `flake8-tidy-imports` banned-api or
  ruff's `TID251` (banned imports/attributes) for "never call X outside its
  definition site" laws.
- **semgrep** for shape-level house rules that need more than a banned
  symbol — each rule with a message that teaches the idiom.
- Route any "this pattern must not appear" law here before writing a test
  for it.

## Channel 3: Property Tests (hypothesis)

```python
from hypothesis import given, strategies as st

@given(st.from_type(EventBatch), st.from_type(EventBatch), st.from_type(EventBatch))
def test_combine_associative(a, b, c):
    assert combine(combine(a, b), c) == combine(a, combine(b, c))

@given(st.from_type(TimeWindow), st.from_type(EventBatch))
def test_left_identity(w, a):
    assert combine(empty(w), a) == a
```

Register `@st.composite` strategies built on smart constructors so only
lawful values are generated; hypothesis shrinks failures to minimal
counterexamples. Resource-lifecycle tests: assert `__exit__` runs on
exception.

## Python Hazards to Flag in Phase 1 (notes fields)

- **Mutable defaults**: `events: list = []` breaks `empty()`-freshness laws;
  require `field(default_factory=list)` (and let ruff B006 enforce it —
  channel 2).
- **`is` vs `==`**: laws use value equality; `frozen=True` dataclasses give
  correct `__eq__` for free.
- **Exception-as-value**: a function that sometimes raises is a hidden
  partial function — mark `total: false`.
- **`Optional[A]` returns**: a hidden `Maybe[A]`; name it in the model.
- **Class hierarchy used as return values**: a hidden sum — express as
  `kind: sum`.
- **Mutable types inside algebras**: laws fail spuriously; freeze everything
  appearing in an algebra.
