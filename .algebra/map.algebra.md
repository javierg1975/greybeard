# Codebase map

The session-start map lists what already exists so "reuse first" costs no search. For Scala 3 and
TypeScript it lists compiler-checked signatures; every other file, and any Scala or TypeScript
file whose compiler index is missing or stale, falls back to the regex name list.

```yaml
module:
  name: map
  purpose: List the project's reusable symbols, with compiler signatures where a fresh compiler index exists.
  depends_on: [check]

types:
  - name: Entry
    kind: alias
    purpose: One reusable symbol, rendered as a single line (a name, or a name with its signature).
    wraps: string
    invariants:
      - "matches SAFE_ENTRY: no repo text other than identifiers, type syntax and short literal tokens reaches the model"

  - name: Precise
    kind: alias
    purpose: Signatures for one source file from its compiler index, or none when that index does not describe the current file.
    wraps: "Option[List[Entry]]"
    notes: "Missing and stale behave the same (fall back to regex), so they are one None, not two variants."

  - name: Witness
    kind: sum
    purpose: The hash a compiler index recorded for the source it describes.
    variants:
      - name: SemanticdbMd5
        fields: [{ name: md5, type: "hex string, written by scalac into TextDocument.md5" }]
      - name: ManifestSha1
        fields: [{ name: sha1, type: "hex string, written by greybeard check next to the emitted .d.ts" }]

algebras:
  - name: Index
    over: [Precise, Witness]
    purpose: Read a compiler index for one source file.
    known_structure: null
    operations:
      - name: signatures
        signature: "Root -> SourcePath -> Bytes -> Precise"
        description: Look up the file's compiler index; return its exported signatures only if the witness matches the bytes.
        pure: false
        total: true
      - name: writeManifest
        signature: "DeclDir -> IO[Unit]"
        description: After tsc emits declarations, record each declaration's source path and the source's sha1.
        pure: false
        total: true
    laws:
      - name: freshness
        description: An index entry is used only while the source is byte-identical to what the compiler read.
        formal: "signatures(f, bytes).isDefined  ==>  witness(f) == hash(bytes)"
      - name: fail-open
        description: Any read or decode failure yields None, never an exception; the regex map still runs.
        formal: "signatures never throws"

  - name: Render
    over: [Entry]
    purpose: Turn a SemanticDB signature or a tsc declaration statement into one Entry.
    known_structure: null
    operations:
      - name: renderType
        signature: "SemanticdbType -> string"
        description: TypeRef, unions, intersections, by-name, repeated, lambda, tuple and function sugar; anything else prints as ?.
        pure: true
        total: true
      - name: declarations
        signature: "DtsText -> List[Entry]"
        description: Top-level exported declarations of a tsc-emitted .d.ts, one line each.
        pure: true
        total: true
    laws:
      - name: sanitized
        description: Every entry that reaches the model matches SAFE_ENTRY; entries that do not are dropped, string literals longer than a short token are blanked.
        formal: "forall e in buildMap(root). SAFE_ENTRY.test(e)"

effects:
  - operation: Index.signatures
    kind: blocking
    description: Synchronous file reads (SemanticDB, manifest, .d.ts) inside the 3 s SessionStart budget.
    idempotent: true
  - operation: Index.writeManifest
    kind: blocking
    description: Runs inside greybeard check after tsc, writes only under the repo's git dir.
    idempotent: true

cross_cutting:
  - concern: prompt injection
    affects: [map]
    constraint: The map is injected into the model's context; repo text that is not an identifier or type syntax must never reach it.
    validation_strategy: tests/map.test.js plants injection text in names, literals and paths for regex, SemanticDB and .d.ts inputs.
  - concern: nothing written to the project
    affects: [check]
    constraint: Declarations, maps and the manifest go under `git rev-parse --git-path greybeard`, never the working tree.
    validation_strategy: declarationDir and incremental:false in the layered tsconfig; reviewed.
```
