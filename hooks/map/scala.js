// Scala 3 signatures from SemanticDB: the compiler's own index, written next to the classes
// whenever the build sets `semanticdbEnabled := true` (greybeard check layers it in).
// A document counts only while its recorded md5 matches the source on disk.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Protobuf wire format, only what SemanticDB uses: varints and length-delimited fields.
function fields(buf, [start, end] = [0, buf.length]) {
  const out = [];
  let i = start;
  const varint = () => {
    let r = 0, m = 1, b;
    do { b = buf[i++]; r += (b & 127) * m; m *= 128; } while (b & 128);
    return r;
  };
  while (i < end) {
    const key = varint(), f = Math.floor(key / 8), wire = key & 7;
    if (wire === 0) out.push([f, varint()]);
    else if (wire === 2) { const len = varint(); out.push([f, [i, i + len]]); i += len; }
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else throw new Error(`semanticdb: wire type ${wire}`);
  }
  return out;
}
const str = (buf, r) => buf.toString('utf8', r[0], r[1]);
const all = (fs_, n) => fs_.filter(([f]) => f === n).map(([, v]) => v);
const one = (fs_, n) => all(fs_, n)[0];

// semanticdb.proto field numbers.
const KIND = { 3: 'def', 7: 'type', 10: 'object', 13: 'class', 14: 'trait', 21: 'ctor' };
const PROP = { case: 0x80, enum: 0x4000, given: 0x10000, opaque: 0x200000, val: 0x400, var: 0x800, primary: 0x2000 };
const PUBLIC_ACCESS = 7;

function readDocument(buf) {
  const doc = one(fields(buf), 1);
  if (!doc) return null;
  const d = fields(buf, doc);
  const symbols = new Map(all(d, 5).map((r) => {
    const s = fields(buf, r);
    const access = one(s, 18);
    return [str(buf, one(s, 1)), {
      kind: one(s, 3) || 0,
      props: one(s, 4) || 0,
      name: one(s, 5) ? str(buf, one(s, 5)) : '',
      sig: one(s, 17),
      // Scala 3 writes no access field for public members; Scala 2 writes PublicAccess.
      public: !access || fields(buf, access).some(([f]) => f === PUBLIC_ACCESS),
    }];
  }));
  return { md5: one(d, 11) ? str(buf, one(d, 11)) : '', symbols };
}

// A backticked Scala name can hold any text; only identifiers and operators reach the map.
const SAFE_NAME = /^(?:[A-Za-z_][\w]*|[!#%&*+\-/:<=>?@\\^|~]+)$/;
const safe = (n) => (SAFE_NAME.test(n) ? n : '?');
// `pkg/Obj.member().`, `pkg/Cls#[A]`, `pkg/Cls#m().(param)`: the last segment, brackets dropped.
const simple = (sym) => safe((sym.match(/([^/.#[\]()]+)[\])]?(?:\(\))?[.#]?$/) || [, '?'])[1]);

function renderType(buf, r) {
  if (!r) return '?';
  const [[f, v] = []] = fields(buf, r);
  const t = v && fields(buf, v);
  const types = (n) => all(t, n).map((x) => renderType(buf, x));
  switch (f) {
    case 2: { // TypeRef
      const name = simple(str(buf, one(t, 2) || [0, 0]));
      const args = types(3);
      if (/^Tuple\d+$/.test(name) && args.length) return `(${args.join(', ')})`;
      if (/^Function\d+$/.test(name) && args.length) {
        const [ret, ...ps] = [args.pop(), ...args];
        return `${ps.length === 1 ? ps[0] : `(${ps.join(', ')})`} => ${ret}`;
      }
      return args.length ? `${name}[${args.join(', ')}]` : name;
    }
    case 20: return `${simple(str(buf, one(t, 2) || [0, 0]))}.type`; // SingleType
    case 17: return types(1).join(' & ');                             // IntersectionType
    case 18: return types(1).join(' | ');                             // UnionType
    case 19: return types(1).join(' with ');                          // WithType
    case 8: return renderType(buf, one(t, 1));                        // AnnotatedType
    case 10: return renderType(buf, one(t, 2));                       // UniversalType
    case 13: return `=> ${renderType(buf, one(t, 1))}`;               // ByNameType
    case 14: return `${renderType(buf, one(t, 1))}*`;                 // RepeatedType
    case 26: return renderType(buf, one(t, 2)).replace(/\[.*\]$/, ''); // LambdaType: `[A] =>> IO[A]` is `IO`
    default: return '?'; // shortcut: literal, structural and match types print as ?; render them when a map needs them.
  }
}

function tparams(buf, scope) {
  const names = scope ? all(fields(buf, scope), 1).map((s) => simple(str(buf, s))) : [];
  return names.length ? `[${names.join(', ')}]` : '';
}

function params(buf, lists, symbols) {
  const out = lists.map((l) => `(${all(fields(buf, l), 1).map((p) => {
    const info = symbols.get(str(buf, p));
    const tpe = info && info.sig && one(fields(buf, info.sig), 4);
    return `${info ? safe(info.name) : '?'}: ${renderType(buf, tpe && one(fields(buf, tpe), 1))}`;
  }).join(', ')})`).join('');
  return out === '()' ? '' : out;
}

function render(buf, sym, info, symbols) {
  const [[f, v] = []] = info.sig ? fields(buf, info.sig) : [];
  const s = v ? fields(buf, v) : [];
  const kind = KIND[info.kind];
  if (f === 1) { // ClassSignature
    const ctor = symbols.get(`${sym}\`<init>\`().`);
    const ctorSig = ctor && ctor.sig && one(fields(buf, ctor.sig), 2);
    const enumCase = info.props & PROP.enum && !ownerOf(sym).endsWith('/');
    const word = enumCase ? '' : info.props & PROP.enum ? 'enum ' : info.props & PROP.case ? 'case class ' : `${kind} `;
    return `${word}${info.name}${tparams(buf, one(s, 1))}${ctorSig ? params(buf, all(fields(buf, ctorSig), 2), symbols) : ''}`;
  }
  // Scala 3 types a parameterless def as by-name; the `=>` says nothing to a caller.
  if (f === 2) return `${info.name}${tparams(buf, one(s, 1))}${params(buf, all(s, 2), symbols)}: ${renderType(buf, one(s, 3)).replace(/^=> /, '')}`;
  if (f === 3) return `${info.props & PROP.opaque ? 'opaque ' : ''}type ${info.name}${tparams(buf, one(s, 1))}`;
  if (f === 4) return `${info.name}: ${renderType(buf, one(s, 1)).replace(/^=> /, '')}`;
  return info.name;
}

const ownerOf = (sym) => sym.replace(/[^/.#]+(\(\))?[.#]$/, '');
// Compiler-written members of case classes, enums and their companions.
const SYNTHETIC = /^(apply|unapply|toString|fromProduct|fromOrdinal|values|valueOf|copy|equals|hashCode|canEqual|ordinal|productArity|productPrefix|productElement|productElementName|_\d+|copy\$default\$\d+|\$ordinal)$/;

// Members a caller can reuse: public, top-level or on an object, trait or class, not compiler-written.
// Objects themselves are not listed: their members carry the `Object.` prefix.
function exported(sym, info, symbols) {
  if (!info.public || !KIND[info.kind] || info.kind === 21 || info.kind === 10 || !SAFE_NAME.test(info.name) || info.name.includes('$')) return false;
  if (sym.includes('(') && !/\(\)\.$/.test(sym)) return false; // parameters and locals inside a method
  const owner = ownerOf(sym);
  if (owner.endsWith('/')) return true;
  const o = symbols.get(owner);
  if (!o || ![10, 13, 14].includes(o.kind)) return false;
  const data = (s) => s && s.props & (PROP.case | PROP.enum);
  if (SYNTHETIC.test(info.name) && (data(o) || data(symbols.get(owner.replace(/\.$/, '#'))))) return false;
  return !(data(o) && o.kind === 13 && info.props & PROP.val); // case-class fields: already in the constructor
}

function semanticdbFile(root, file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const target = path.join(root, dir, 'target');
    let versions = [];
    try { versions = fs.readdirSync(target).filter((v) => v.startsWith('scala-3')); } catch (e) { /* no target here */ }
    for (const v of versions) for (const sub of ['meta', 'classes']) {
      const p = path.join(target, v, sub, 'META-INF', 'semanticdb', `${file}.semanticdb`);
      if (fs.existsSync(p)) return p;
    }
    if (dir === '.' || dir === path.dirname(dir)) return null;
  }
}

// Signatures for one tracked .scala file, or null when SemanticDB is missing or stale.
function signatures(root, file, source) {
  try {
    const p = semanticdbFile(root, file);
    const buf = p && fs.readFileSync(p);
    const doc = buf && readDocument(buf);
    if (!doc || doc.md5.toUpperCase() !== crypto.createHash('md5').update(source).digest('hex').toUpperCase()) return null;
    return [...doc.symbols].filter(([sym, info]) => exported(sym, info, doc.symbols)).map(([sym, info]) => {
      const prefix = ownerOf(sym).endsWith('/') ? '' : `${simple(ownerOf(sym))}.`;
      return render(buf, sym, info, doc.symbols).replace(/^((?:case class|class|trait|enum|opaque type|type) )?/, `$1${prefix}`);
    });
  } catch (e) { return null; }
}

module.exports = { signatures, renderType, fields };
