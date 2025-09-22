import Fuse from 'fuse.js';
import { ASTNode, TermNode, FieldGroupNode } from './parser';
import { dbgEval, j } from '../../api/logger/debugger';
import { dumpTargetNoteDebug } from '../../api/logger/targetNoteDebugger';

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
} & Record<string, unknown>; // For testing, allow arbitrary extra fields

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

const VIRTUAL_FIELDS = new Set([
  'title',
  'file',
  'path',
  'created',
  'modified',
  'tag',
  'tags',
  'content',
  'bookmarked',
  'aliases',
  'anyname',
  'locations',
  'full',
]);

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

function strEqualsCaseFold(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

function isEmptyStringValue(v: string): boolean {
  return v.trim().length === 0;
}

function hasNonEmptyValue(values: string[]): boolean {
  return values.some(v => !isEmptyStringValue(v));
}

// Unescape backslash-escaped quotes and backslashes in query literals (phrases only)
function unescapeQueryLiteral(s: string): string {
  // \" -> ", \\ -> \
  return s.replace(/\\([\\"])/g, '$1');
}

function valueToStrings(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(valueToStrings);
  if (typeof v === 'string') return [v];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  // objects: join shallow string values
  return [];
}

export function getFieldValues(doc: Doc, field: string, opts: EvaluateOptions): string[] {
  const TARGET = "name-of-your-note"; // for targeted debugging
  const isTarget = String((doc as any).id || "").includes(TARGET);

  // Special case: content: → none-empty notes only
  if (field.toLowerCase() === 'content') {
    const out = valueToStrings(doc.content).map(s => s.trim()).filter(s => s.length > 0);
    if (isTarget) dbgEval('getFieldValues, TARGET content,', { out });
    return out;
  }

  const getter = opts.fieldMap?.[field];
  if (getter) return valueToStrings(getter(doc));
  // fallback to direct properties
  const val = (doc as any)[field];
  const out = valueToStrings(val);
  if (isTarget && (field === "title" || field === "tags" || field === "path")) {
    dbgEval("getFieldValues, TARGET,", { field, out });
  }
  return out;
}

function collectFields(
  doc: Doc,
  fields: string[],
  opts: EvaluateOptions,
  entryOverride?: EntryOverride
): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (
      entryOverride &&
      doc.id === entryOverride.docId &&
      f.toLowerCase() === entryOverride.fieldLower
    ) {
      out.push(...entryOverride.values);
    } else {
      out.push(...getFieldValues(doc, f, opts));
    }
  }
  return out;
}

// ————————————————————————————————————————————————————————————
// Leaf evaluation
// ————————————————————————————————————————————————————————————

type LeafEval = {
  ids: Set<string>;
  scores: Map<string, number>; // only populated for fuzzy
};

type EntryOverride = {
  docId: string;
  field: string;
  fieldLower: string;
  values: string[];
};

function evalExactLeaf(
  docs: Doc[],
  node: TermNode,
  fields: string[],
  opts: EvaluateOptions,
  primaryField?: string,
  forcePresenceNonEmpty = false,
  entryOverride?: EntryOverride
): LeafEval {
  let matched;
  const q = node.phrase ? unescapeQueryLiteral(node.value) : node.value;
  const ids = new Set<string>();
  for (const d of docs) {
    const values = collectFields(d, fields, opts, entryOverride);
    const targetField = primaryField;
    const docAny = d as any;
    const propertyPresent = targetField
      ? Object.prototype.hasOwnProperty.call(docAny, targetField) || (targetField in docAny)
      : false;
    const hasValues = values.length > 0 || propertyPresent;
    const hasNonEmpty = hasNonEmptyValue(values);
    // Bare key:   ⇒ present AND non-empty
    // key:""      ⇒ handled earlier (empty-only)
    // key:exists  ⇒ presence-only (empty OR non-empty)
    // key:has     ⇒ alias for presence-only
    const valLower = node.value.toLowerCase();
    if (targetField === 'bookmarked') {
      const isTrue = values.some(v => strEqualsCaseFold(v, 'true'));
      if (node.phrase) {
        if (node.value === '') {
          matched = false;
        } else if (valLower === 'true') {
          matched = isTrue;
        } else if (valLower === 'false') {
          matched = values.some(v => strEqualsCaseFold(v, 'false'));
        } else {
          matched = values.some(v => strEqualsCaseFold(v, node.value));
        }
      } else {
        if (node.value === '' || valLower === 'any' || valLower === 'true') {
          matched = isTrue;
        } else if (valLower === 'false') {
          matched = false;
        } else {
          matched = values.some(v => strEqualsCaseFold(v, node.value));
        }
      }
    } else if (targetField && !node.phrase) {
      if (node.value === '') {
        matched = forcePresenceNonEmpty ? hasNonEmpty : hasValues;
      } else if (valLower === 'any') {
        matched = hasNonEmpty;
      } else {
        matched = values.some(v => strIncludes(v, node.value));
      }
    } else {
      matched = values.some(v => strIncludes(v, q));
    }
    if (matched) ids.add(d.id);
  }

  // For targeted debugging
  const targetNoteTitle = "testme7";
  dumpTargetNoteDebug(targetNoteTitle, docs, fields, node, opts, Boolean(matched));

  return { ids, scores: new Map() };
}

function buildFuseIndex(
  docs: Doc[],
  fields: string[],
  opts: EvaluateOptions,
  entryOverride?: EntryOverride
) {
  // Build a single index over the desired fields, mapping them onto a joined string per doc for simplicity.
  // For better weighting, you could use Fuse keys per field; here we keep it lightweight.
  const items = docs.map(d => ({
    id: d.id,
    blob: collectFields(d, fields, opts, entryOverride).join(' \n '),
  }));
  return new Fuse(items, {
    includeScore: true,
    threshold: opts.fuzzy?.threshold ?? 0.35,
    minMatchCharLength: opts.fuzzy?.minMatchCharLength ?? 2,
    ignoreLocation: true,
    keys: ['blob'],
  });
}

function evalRegexLeaf(
  docs: Doc[],
  node: TermNode,
  fields: string[],
  opts: EvaluateOptions,
  entryOverride?: EntryOverride
): LeafEval {
  // 1. Log at function start
  dbgEval('evalRegexLeaf, start', { pattern: node.regex?.pattern, flags: node.regex?.flags, docCount: docs.length });
  const ids = new Set<string>();
  const scores = new Map<string, number>();

  // Defensive: node.regex should exist here
  if (!node.regex) return { ids, scores };

  let re: RegExp;
  try {
    re = new RegExp(node.regex.pattern, node.regex.flags);
    // 2. Log compiled regex
    dbgEval('evalRegexLeaf, compiled regex', re);
  } catch {
    // Invalid regex → no matches (you could also choose to fallback to literal)
    return { ids, scores };
  }

  for (const d of docs) {
    const values = collectFields(d, fields, opts, entryOverride);
    const matched = values.some(v => re.test(v));
    if (matched) {
      dbgEval('evalRegexLeaf, MATCH', { id: d.id, testedValues: values.length });
      ids.add(d.id);
    }
  }
  // 6. Log total matches before returning
  dbgEval('evalRegexLeaf, done', { matchCount: ids.size });
  return { ids, scores };
}

function evalFuzzyLeaf(
  docs: Doc[],
  node: TermNode,
  fields: string[],
  opts: EvaluateOptions,
  fuseCache: Map<string, Fuse<any>>,
  entryOverride?: EntryOverride,
  allowCache = true
): LeafEval {
  let fuse: Fuse<any>;
  if (allowCache && !entryOverride) {
    const cacheKey = fields.join('|');
    let cached = fuseCache.get(cacheKey);
    if (!cached) {
      cached = buildFuseIndex(docs, fields, opts);
      fuseCache.set(cacheKey, cached);
    }
    fuse = cached;
  } else {
    fuse = buildFuseIndex(docs, fields, opts, entryOverride);
  }
  const q = node.phrase ? unescapeQueryLiteral(node.value) : node.value;
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

function combineScores(sum: Map<string, number>, add: Map<string, number>) {
  for (const [id, s] of add) sum.set(id, (sum.get(id) ?? 0) + s);
}

// ————————————————————————————————————————————————————————————
// Evaluator
// ————————————————————————————————————————————————————————————

export function evaluateQueryAST(ast: ASTNode, docs: Doc[], opts: EvaluateOptions): SearchResult {
  dbgEval('evaluateQueryAST, AST input:', j(ast));
  const defaultFields = opts.defaultFields;
  const fuseCache = new Map<string, Fuse<any>>();
  function evalNode(
    node: ASTNode,
    overrideField?: string,
    docsForEval: Doc[] = docs,
    entryOverride?: EntryOverride,
    allowCache = !entryOverride && docsForEval === docs
  ): { ids: Set<string>, scores: Map<string, number> } {
    switch (node.type) {
      case 'Term': {
        const fields = node.field ? [node.field] : overrideField ? [overrideField] : defaultFields;
        const effectiveField = (node.field ?? overrideField)?.toLowerCase();
        const isVirtualField = effectiveField ? VIRTUAL_FIELDS.has(effectiveField) : false;

        if (isVirtualField && effectiveField !== 'bookmarked' && node.phrase && node.value === '') {
          return { ids: new Set(), scores: new Map() };
        }

        // Empty-quote semantics: "" means "empty or undefined" for the field(s)
        if (node.phrase && node.value === '') {
          if (node.field) {
            const ids = new Set<string>();
            const SAMPLE_LIMIT = 5;
            const sampleMatched: any[] = [];
            const sampleMissed: any[] = [];
            let matchedCount = 0;

            for (const d of docsForEval) {
              const values = collectFields(d, fields, opts, entryOverride);
              const docAny = d as any;
              const propertyPresent = (node.field in docAny) || Object.prototype.hasOwnProperty.call(docAny, node.field);
              const present = values.length > 0 || propertyPresent;
              const isEmptyOrUndefined = values.length === 0 || values.every(isEmptyStringValue);
              const matched = present && isEmptyOrUndefined;
              if (matched) {
                ids.add(d.id);
                matchedCount++;
                if (sampleMatched.length < SAMPLE_LIMIT) {
                  sampleMatched.push({ id: d.id, raw: values });
                }
              } else if (sampleMissed.length < SAMPLE_LIMIT) {
                sampleMissed.push({ id: d.id, raw: values });
              }
            }

            dbgEval('empty-quote fielded, summary', {
              field: node.field,
              totalDocs: docsForEval.length,
              matchedCount,
              sampleMatched,
              sampleMissed,
            });

            return { ids, scores: new Map() };
          } else {
            const ids = new Set<string>();
            // Unfielded "": match docs where ANY default field is present AND empty
            for (const d of docsForEval) {
              for (const f of fields) {
                const valuesForField = collectFields(d, [f], opts, entryOverride);
                const docAny = d as any;
                const propertyPresent = (f in docAny) || Object.prototype.hasOwnProperty.call(docAny, f);
                const present = valuesForField.length > 0 || propertyPresent;
                const isEmptyOrUndefined = valuesForField.length === 0 || valuesForField.every(isEmptyStringValue);
                if (present && isEmptyOrUndefined) { ids.add(d.id); break; }
              }
            }
            return { ids, scores: new Map() };
          }
        }

        // Regex has highest priority
        if (node.regex) {
          return evalRegexLeaf(docsForEval, node, fields, opts, entryOverride);
        }

        // Fuzzy next (only for terms explicitly suffixed with ~)
        if (node.fuzzy) {
          return evalFuzzyLeaf(docsForEval, node, fields, opts, fuseCache, entryOverride, allowCache);
        }

        // Otherwise: exact (folded includes)
        const exactMatchField = effectiveField;
        if (exactMatchField === 'tag') {
          const target = node.value.startsWith('#') ? node.value.slice(1) : node.value;
          const ids = new Set<string>();
          for (const d of docsForEval) {
            const tagValues = collectFields(d, fields, opts, entryOverride).map(v => (typeof v === 'string' && v.startsWith('#') ? v.slice(1) : v));
            if (tagValues.some(v => strEqualsCaseFold(v, target))) {
              ids.add(d.id);
            }
          }
          return { ids, scores: new Map() };
        }

        if (exactMatchField === 'tags') {
          const target = node.value;
          const ids = new Set<string>();
          for (const d of docsForEval) {
            const tagValues = collectFields(d, fields, opts, entryOverride);
            if (tagValues.some(v => strIncludes(v, target))) {
              ids.add(d.id);
            }
          }
          return { ids, scores: new Map() };
        }

        const primaryField = node.field ?? overrideField;
        return evalExactLeaf(
          docsForEval,
          node,
          fields,
          opts,
          primaryField,
          Boolean(primaryField && isVirtualField),
          entryOverride
        );
      }
      case 'Not': {
        const inner = evalNode(node.child, overrideField, docsForEval, entryOverride, allowCache);
        const ids = new Set<string>();
        for (const d of docsForEval) {
          if (!inner.ids.has(d.id)) ids.add(d.id);
        }
        return { ids, scores: new Map() };
      }
      case 'And': {
        let acc: Set<string> | null = null;
        const scoreAcc = new Map<string, number>();
        for (const c of node.children) {
          const { ids, scores } = evalNode(c, overrideField, docsForEval, entryOverride, allowCache);
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
          const { ids, scores } = evalNode(c, overrideField, docsForEval, entryOverride, allowCache);
          acc = setUnion(acc, ids);
          combineScores(scoreAcc, scores);
        }
        return { ids: acc, scores: scoreAcc };
      }
      case 'Group': {
        return node.child
          ? evalNode(node.child, overrideField, docsForEval, entryOverride, allowCache)
          : { ids: new Set(), scores: new Map() };
      }
      case 'FieldGroup': {
        if (!node.child) {
          return { ids: new Set(), scores: new Map() };
        }
        const ids = new Set<string>();
        const scoreAcc = new Map<string, number>();
        const fieldName = node.field;
        const fieldLower = fieldName.toLowerCase();

        for (const d of docsForEval) {
          const entryValues = getFieldValues(d, fieldName, opts);
          if (entryValues.length === 0) continue;

          for (const value of entryValues) {
            const override: EntryOverride = {
              docId: d.id,
              field: fieldName,
              fieldLower,
              values: [value],
            };

            const { ids: childIds, scores } = evalNode(
              node.child,
              fieldName,
              [d],
              override,
              false
            );

            if (childIds.has(d.id)) {
              ids.add(d.id);
              combineScores(scoreAcc, scores);
              break;
            }
          }
        }

        return { ids, scores: scoreAcc };
      }
    }
  }

  const { ids, scores } = evalNode(ast, undefined, docs, undefined, true);
  // Convert to sorted list: lower score first; exact-only docs have score 0
  const hits: SearchHit[] = Array.from(ids).map(id => ({ id, score: scores.get(id) ?? 0 }));
  hits.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  return { hits };
}

// Convenience: run string query directly if caller prefers
export { parseQuery } from './parser';
