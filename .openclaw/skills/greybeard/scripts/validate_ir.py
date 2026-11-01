#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["pyyaml"]
# ///
"""Deterministic schema check for Algebra IR documents (see
references/algebra-ir.md). Accepts a YAML file or a markdown file containing
```yaml fenced blocks (all blocks are checked). Exit 0 = valid.

Usage: uv run validate_ir.py <file.{yaml,yml,md}>   (or ./validate_ir.py)
"""
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("validate_ir.py: PyYAML required — run via `uv run validate_ir.py` "
             "(uv resolves it from the inline metadata) or pip install pyyaml")

KINDS = {"sum", "product", "opaque", "phantom", "recursive", "alias"}
EFFECTS = {"pure", "io", "blocking", "async"}
COMPLEXITY = {"low", "medium", "high"}
STRUCTURES = {
    "Semigroup", "Monoid", "Group", "Functor", "Applicative", "Monad",
    "Foldable", "Traverse", "NaturalTransformation", "Semilattice",
}

errors: list[str] = []


def err(path: str, msg: str) -> None:
    errors.append(f"  {path}: {msg}")


def check_doc(doc: dict, label: str) -> None:
    if not isinstance(doc, dict):
        err(label, "IR document must be a mapping")
        return
    module = doc.get("module")
    if not isinstance(module, dict) or not module.get("name"):
        err(f"{label}.module", "required, with a 'name'")

    type_names = set()
    for i, t in enumerate(doc.get("types") or []):
        p = f"{label}.types[{i}]"
        if not t.get("name"):
            err(p, "missing 'name'")
        else:
            type_names.add(t["name"])
        kind = t.get("kind")
        if kind and kind not in KINDS:
            err(p, f"kind '{kind}' not in {sorted(KINDS)}")
        if kind == "sum" and not t.get("variants"):
            err(p, "sum type without 'variants'")
        if kind == "opaque" and not t.get("wraps"):
            err(p, "opaque type without 'wraps'")

    for i, a in enumerate(doc.get("algebras") or []):
        p = f"{label}.algebras[{i}]"
        if not a.get("name"):
            err(p, "missing 'name'")
        ks = a.get("known_structure")
        if ks and ks not in STRUCTURES:
            err(p, f"known_structure '{ks}' not recognised "
                   f"(use null for custom algebras)")
        ops = a.get("operations") or []
        if not ops:
            err(p, "algebra without operations")
        for j, op in enumerate(ops):
            if not op.get("name"):
                err(f"{p}.operations[{j}]", "missing 'name'")
        if not (a.get("laws") or []):
            err(p, "algebra without laws — question whether it is one "
                   "(warning-level; lawless algebras give Validate nothing)")

    for i, e in enumerate(doc.get("effects") or []):
        if e.get("kind") not in EFFECTS:
            err(f"{label}.effects[{i}]", f"kind must be one of {sorted(EFFECTS)}")

    # Error sums declared under `errors:` are legitimate block references too.
    for e in doc.get("errors") or []:
        if e.get("name"):
            type_names.add(e["name"])

    block_names = set()
    for i, b in enumerate(doc.get("blocks") or []):
        p = f"{label}.blocks[{i}]"
        if not b.get("name"):
            err(p, "missing 'name'")
        else:
            block_names.add(b["name"])
        c = b.get("complexity")
        if c and c not in COMPLEXITY:
            err(p, f"complexity '{c}' not in {sorted(COMPLEXITY)}")
        for t in b.get("types") or []:
            if type_names and t not in type_names:
                err(p, f"references unknown type '{t}'")
    for i, b in enumerate(doc.get("blocks") or []):
        for d in b.get("depends_on") or []:
            if d not in block_names:
                err(f"{label}.blocks[{i}]", f"depends_on unknown block '{d}'")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    text = open(path).read()
    if path.endswith((".md", ".markdown")):
        docs = re.findall(r"```ya?ml\n(.*?)```", text, re.DOTALL)
        if not docs:
            print(f"{path}: no ```yaml blocks found")
            return 1
    else:
        docs = [text]
    for n, raw in enumerate(docs):
        try:
            parsed = yaml.safe_load(raw)
        except yaml.YAMLError as e:
            err(f"doc[{n}]", f"YAML parse error: {e}")
            continue
        check_doc(parsed, f"doc[{n}]")
    if errors:
        print(f"{path}: INVALID")
        print("\n".join(errors))
        return 1
    print(f"{path}: OK ({len(docs)} document(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
