import Fuse from 'fuse.js';
import { ASTNode, TermNode, AndNode, OrNode, NotNode } from './parse';
import { dbgEval, j } from '../debugging/debug';

/**
 * Document shape used by the evaluator. Extend to your needs.
 */
export type Doc = {
  id: string;                 // unique id (e.g., path)
  title?: string;
  path?: string;
  tags?: string[];
  content?: string;              // note body/content (for content: special case)
  // You can add more fields and map them via EvaluateOptions.fieldMap
};

export type EvaluateOptions = {
  // Which fields to search when a term is unfielded
  defaultFields: string[]; // e.g., ['title','tags','path']

  // Map external field names to getters on the doc
  // Example: { tag: (d) => d.tags ?? [], title: (d) => d.title ?? '' }
  fieldMap?: Record<string, (doc: Doc) => string | string[] | undefined>;

  // Fuzzy config (Fuse.js)
  fuzzy?: {
    threshold?: number;          // default 0.35
    minMatchCharLength?: number; // default 2
  };
};

export type SearchHit = {
  id: string;
  score: number; // lower is better
};

export type SearchResult = {
  hits: SearchHit[]; // sorted by score asc
  // For debugging / UI
  diagnostics?: { ast?: string };
};

// ————————————————————————————————————————————————————————————
// Utilities
// ————————————————————————————————————————————————————————————

function fold(s: string): string {
  return s
    .normalize('NFD')
    // remove diacritics
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function strIncludes(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}

function valueToStrings(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(valueToStrings);
  if (typeof v === 'string') return [v];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  // objects: join shallow string values
  return [];
}

function getFieldValues(doc: Doc, field: string, opts: EvaluateOptions): string[] {
  const TARGET = "name-of-your-note"; // for targeted debugging
  const isTarget = String((doc as any).id || "").includes(TARGET);

  // Special case: content: → none-empty notes only
  if (field.toLowerCase() === 'content') {
    const out = valueToStrings(doc.content).map(s => s.trim()).filter(s => s.length > 0);
    if (isTarget) dbgEval('[getFieldValues TARGET content]', { out });
    return out;
  }

  const getter = opts.fieldMap?.[field];
  if (getter) return valueToStrings(getter(doc));
  // fallback to direct properties
  const val = (doc as any)[field];
  const out = valueToStrings(val);
  if (isTarget && (field === "title" || field === "tags" || field === "path")) {
    dbgEval("[getFieldValues TARGET]", { field, out });
  }
  return out;
}

function collectFields(doc: Doc, fields: string[], opts: EvaluateOptions): string[] {
  const out: string[] = [];
  for (const f of fields) out.push(...getFieldValues(doc, f, opts));
  return out;
}

// ————————————————————————————————————————————————————————————
// Leaf evaluation
// ————————————————————————————————————————————————————————————

/**
 * Note on empty fielded terms:
 * Currently, queries like `key:` with an empty value will match all documents that contain the field,
 * because the evaluator uses substring logic (`strIncludes(v, "")`), which always returns true.
 * This can lead to “all notes are included” behavior if the field exists on every note,
 * even though the value is empty. This also aligns with Obsidian’s search plugin.
 */
type LeafEval = {
  ids: Set<string>;
  scores: Map<string, number>; // only populated for fuzzy
};

function evalExactLeaf(docs: Doc[], node: TermNode, fields: string[], opts: EvaluateOptions): LeafEval {
  let values, matched;
  const ids = new Set<string>();
  for (const d of docs) {
    values = collectFields(d, fields, opts);
    // Bare key:   ⇒ present AND non-empty
    // key:""      ⇒ handled earlier (empty-only)
    // key:exists  ⇒ presence-only (empty OR non-empty)
    // key:has     ⇒ alias for presence-only
    if (node.field && !node.phrase && node.value === '') {
      const docAny = d as any;
      const present = Object.prototype.hasOwnProperty.call(docAny, node.field) || (node.field in docAny);
      const raw = docAny[node.field];
      const isEmpty =
        raw == null ||
        (typeof raw === 'string' && raw.trim().length === 0) ||
        (Array.isArray(raw) && raw.length === 0);
      matched = present && !isEmpty;
    } else if (node.field && !node.phrase) {
      const val = String(node.value).toLowerCase();
      if (val === 'exists' || val === 'has') {
        const docAny = d as any;
        matched = Object.prototype.hasOwnProperty.call(docAny, node.field) || (node.field in docAny);
      } else {
        matched = values.some(v => strIncludes(v, node.value));
      }
    } else {
      matched = values.some(v => strIncludes(v, node.value));
    }
    if (matched) ids.add(d.id);
  }
  
  const TARGET = "03.12_Stefans-Desktop-PC-2025";
  for (const d of docs) {
    if (String((d as any).id || "").includes(TARGET)) {
      dbgEval('[evalExactLeaf TARGET]', { fields, queryValue: node.value, values, matched });
    }
  }

  return { ids, scores: new Map() };
}

function buildFuseIndex(docs: Doc[], fields: string[], opts: EvaluateOptions) {
  // Build a single index over the desired fields, mapping them onto a joined string per doc for simplicity.
  // For better weighting, you could use Fuse keys per field; here we keep it lightweight.
  const items = docs.map(d => ({
    id: d.id,
    blob: collectFields(d, fields, opts).join(' \n '),
  }));
  return new Fuse(items, {
    includeScore: true,
    threshold: opts.fuzzy?.threshold ?? 0.35,
    minMatchCharLength: opts.fuzzy?.minMatchCharLength ?? 2,
    ignoreLocation: true,
    keys: ['blob'],
  });
}

function evalRegexLeaf(docs: Doc[], node: TermNode, fields: string[], opts: EvaluateOptions): LeafEval {
  // 1. Log at function start
  dbgEval('[evalRegexLeaf] start', { pattern: node.regex?.pattern, flags: node.regex?.flags, docCount: docs.length });
  const ids = new Set<string>();
  const scores = new Map<string, number>();

  // Defensive: node.regex should exist here
  if (!node.regex) return { ids, scores };

  let re: RegExp;
  try {
    re = new RegExp(node.regex.pattern, node.regex.flags);
    // 2. Log compiled regex
    dbgEval('[evalRegexLeaf] compiled regex', re);
  } catch {
    // Invalid regex → no matches (you could also choose to fallback to literal)
    return { ids, scores };
  }

  for (const d of docs) {
    const values = collectFields(d, fields, opts);
    const matched = values.some(v => re.test(v));
    if (matched) {
      dbgEval('[evalRegexLeaf] MATCH', { id: d.id, testedValues: values.length });
      ids.add(d.id);
    }
  }
  // 6. Log total matches before returning
  dbgEval('[evalRegexLeaf] done', { matchCount: ids.size });
  return { ids, scores };
}

function evalFuzzyLeaf(docs: Doc[], node: TermNode, fields: string[], opts: EvaluateOptions, fuseCache: Map<string, Fuse<any>>): LeafEval {
  const cacheKey = fields.join('|');
  let fuse = fuseCache.get(cacheKey);
  if (!fuse) {
    fuse = buildFuseIndex(docs, fields, opts);
    fuseCache.set(cacheKey, fuse);
  }
  const q = node.phrase ? node.value : node.value; // same; phrase semantics handled by parser flag if needed upstream
  const results = fuse.search(q);
  const ids = new Set<string>();
  const scores = new Map<string, number>();
  for (const r of results) {
    ids.add(r.item.id);
    // Fuse score: 0 perfect → 1 worse. Keep as-is for additive ranking.
    scores.set(r.item.id, Math.max(0, r.score ?? 0));
  }
  return { ids, scores };
}

// ————————————————————————————————————————————————————————————
// Boolean combination helpers
// ————————————————————————————————————————————————————————————

function setIntersection(a: Set<string>, b: Set<string>): Set<string> {
  if (a.size > b.size) [a, b] = [b, a];
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function setUnion(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>(a);
  for (const x of b) out.add(x);
  return out;
}

function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}

function combineScores(sum: Map<string, number>, add: Map<string, number>) {
  for (const [id, s] of add) sum.set(id, (sum.get(id) ?? 0) + s);
}

// ————————————————————————————————————————————————————————————
// Evaluator
// ————————————————————————————————————————————————————————————

export function evaluateQueryAST(ast: ASTNode, docs: Doc[], opts: EvaluateOptions): SearchResult {
  dbgEval('[evaluateQueryAST] AST input:', j(ast));
  const defaultFields = opts.defaultFields;
  const fuseCache = new Map<string, Fuse<any>>();
  const universe = new Set(docs.map(d => d.id));

  function evalNode(node: ASTNode): { ids: Set<string>, scores: Map<string, number> } {
    switch (node.type) {
      case 'Term': {
        const fields = node.field ? [node.field] : defaultFields;

        // Empty-quote semantics: "" means "empty or undefined" for the field(s)
        if (node.phrase && node.value === '') {
          if (node.field) {
            const ids = new Set<string>();
            const SAMPLE_LIMIT = 5;
            const sampleMatched: any[] = [];
            const sampleMissed: any[] = [];
            let matchedCount = 0;

            for (const d of docs) {
              const docAny = d as any;
              const present = (node.field in docAny) || Object.prototype.hasOwnProperty.call(docAny, node.field);
              const raw = docAny[node.field];
              const isEmptyOrUndefined =
                raw == null ||
                (typeof raw === 'string' && raw.trim().length === 0) ||
                (Array.isArray(raw) && raw.length === 0);
              const matched = present && isEmptyOrUndefined;
              if (matched) {
                ids.add(d.id);
                matchedCount++;
                if (sampleMatched.length < SAMPLE_LIMIT) {
                  sampleMatched.push({ id: d.id, raw });
                }
              } else if (sampleMissed.length < SAMPLE_LIMIT) {
                sampleMissed.push({ id: d.id, raw });
              }
            }

            dbgEval('[empty-quote fielded] summary', {
              field: node.field,
              totalDocs: docs.length,
              matchedCount,
              sampleMatched,
              sampleMissed,
            });

            return { ids, scores: new Map() };
          } else {
            // Unfielded "": match docs where ANY default field is present AND empty
            for (const d of docs) {
              const docAny = d as any;
              for (const f of fields) {
                const present = (f in docAny) || Object.prototype.hasOwnProperty.call(docAny, f);
                const raw = docAny[f];
                const isEmptyOrUndefined =
                  raw == null ||
                  (typeof raw === 'string' && raw.trim().length === 0) ||
                  (Array.isArray(raw) && raw.length === 0);
                if (present && isEmptyOrUndefined) { ids.add(d.id); break; }
              }
            }
            return { ids, scores: new Map() };
          }
        }

        // Regex has highest priority
        if (node.regex) {
          return evalRegexLeaf(docs, node, fields, opts);
        }

        // Fuzzy next (only for terms explicitly suffixed with ~)
        if (node.fuzzy) {
          return evalFuzzyLeaf(docs, node, fields, opts, fuseCache);
        }

        // Otherwise: exact (folded includes)
        return evalExactLeaf(docs, node, fields, opts);
      }
      case 'Not': {
        const inner = evalNode(node.child);
        return { ids: setDifference(universe, inner.ids), scores: new Map() };
      }
      case 'And': {
        let acc: Set<string> | null = null;
        const scoreAcc = new Map<string, number>();
        for (const c of node.children) {
          const { ids, scores } = evalNode(c);
          acc = acc ? setIntersection(acc, ids) : ids;
          combineScores(scoreAcc, scores);
          if (acc.size === 0) break;
        }
        return { ids: acc ?? new Set(), scores: scoreAcc };
      }
      case 'Or': {
        let acc = new Set<string>();
        const scoreAcc = new Map<string, number>();
        for (const c of node.children) {
          const { ids, scores } = evalNode(c);
          acc = setUnion(acc, ids);
          combineScores(scoreAcc, scores);
        }
        return { ids: acc, scores: scoreAcc };
      }
      case 'Group': {
        return node.child ? evalNode(node.child) : { ids: new Set(), scores: new Map() };
      }
    }
  }

  const { ids, scores } = evalNode(ast);
  // Convert to sorted list: lower score first; exact-only docs have score 0
  const hits: SearchHit[] = Array.from(ids).map(id => ({ id, score: scores.get(id) ?? 0 }));
  hits.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  return { hits };
}

// Convenience: run string query directly if caller prefers
export { parseQuery } from './parse';