/*
 * Search query syntax validator (pre-parse)
 *
 * Rules enforced (structural only):
 * - Balanced parentheses
 * - AND/OR not dangling and not doubled
 * - Regex literals `/.../flags` must close (deep regex validation is deferred)
 */

export type ValidationIssue = {
  index: number;
  length?: number;
  code:
  | 'UNBALANCED_PARENS'
  | 'DANGLING_OPERATOR'
  | 'UNFINISHED_REGEX';
};

export type ValidationResult = { ok: true } | { ok: false; issue: ValidationIssue };

// Character helpers ---------------------------------------------------------
function isWhitespace(ch: string) {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

function isSpecial(ch: string) {
  return ch === '(' || ch === ')' || ch === '-' || ch === '~' || ch === ':';
}

function isTermChar(ch: string) {
  return !isWhitespace(ch) && !isSpecial(ch) && ch !== '"' && ch !== '/';
}

function startsOperator(input: string, i: number) {
  // AND / OR, case-insensitive, must be bounded by separators
  const prev = i > 0 ? input[i - 1] : undefined;
  const isPrevBoundary =
    prev === undefined ||
    isWhitespace(prev) ||
    prev === '(' ||
    prev === ')';
  if (!isPrevBoundary) return null;

  const rest = input.slice(i);
  if (/^(AND)(?![A-Za-z0-9_])/.test(rest)) return { op: 'AND', len: 3 } as const;
  if (/^(OR)(?![A-Za-z0-9_])/.test(rest)) return { op: 'OR', len: 2 } as const;
  if (/^(and)(?![A-Za-z0-9_])/.test(rest)) return { op: 'AND', len: 3 } as const;
  if (/^(or)(?![A-Za-z0-9_])/.test(rest)) return { op: 'OR', len: 2 } as const;
  return null;
}

// Lightweight quoted reader used only for structural validation. If a closing quote
// is found with standard escapes (\"), returns the index after the closing quote;
// otherwise returns null and the caller may consume a single '"' leniently.
function readQuotedLite(input: string, i: number): number | null {
  let k = i + 1;
  let escaped = false;
  while (k < input.length) {
    const ch = input[k];
    if (escaped) { escaped = false; k++; continue; }
    if (ch === '\\') { escaped = true; k++; continue; }
    if (ch === '"') { return k + 1; }
    k++;
  }
  return null;
}

// Skip consecutive TERM characters (including simple escapes) used in validation only
function skipTerm(input: string, i: number): number {
  while (i < input.length) {
    const c = input[i];
    if (isTermChar(c)) { i++; continue; }
    if (c === '\\' && i + 1 < input.length) { i += 2; continue; }
    break;
  }
  return i;
}

// Read a regex literal starting at index i (where input[i] === '/')
function readRegex(input: string, i: number): { end: number } | null {
  let k = i + 1;
  let escaped = false;
  while (k < input.length) {
    const ch = input[k];
    if (escaped) {
      escaped = false;
      k++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      k++;
      continue;
    }
    if (ch === '/') {
      // consume optional flags [a-z]*
      k++;
      while (k < input.length && /[a-z]/i.test(input[k])) k++;
      return { end: k };
    }
    k++;
  }
  return null; // unfinished
}

// NOTE: This validator is structural-only; token semantics (quotes/fields/fuzzy) are handled by lexer/parser.
// Main validator ------------------------------------------------------------
export function validateQuerySyntax(input: string): ValidationResult {
  const n = input.length;
  let i = 0;
  let parenDepth = 0;
  let lastWasValue = false; // last token was a VALUE (TERM/PHRASE/REGEX)
  let lastWasOperator = false; // last token was AND/OR

  // Skip initial whitespace
  while (i < n && isWhitespace(input[i])) i++;

  while (i < n) {
    const ch = input[i];

    // Whitespace → separator
    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Parentheses
    if (ch === '(') {
      parenDepth++;
      lastWasValue = false;
      lastWasOperator = false;
      i++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth === 0) {
        return {
          ok: false,
          issue: {
            index: i,
            code: 'UNBALANCED_PARENS',
          },
        };
      }
      parenDepth--;
      lastWasValue = true;
      lastWasOperator = false;
      i++;
      continue;
    }

    // Operators AND/OR
    const op = startsOperator(input, i);
    if (op) {
      // operator must be between two values/clauses
      if (lastWasOperator || !lastWasValue) {
        return {
          ok: false,
          issue: {
            index: i,
            length: op.len,
            code: 'DANGLING_OPERATOR',
          },
        };
      }
      i += op.len;
      lastWasOperator = true;
      lastWasValue = false;
      continue;
    }

    // Quote character — lenient: consume and treat as part of a value for validation purposes.
    // The tokenizer/parser will decide if this becomes a PHRASE or a literal depending on closure.
    if (ch === '"') {
      const end = readQuotedLite(input, i);
      i = end ?? (i + 1); // if unfinished, consume one char leniently
      lastWasValue = true; // a phrase counts as a VALUE for operator placement
      lastWasOperator = false;
      continue;
    }

    // Regex
    if (ch === '/') {
      const rg = readRegex(input, i);
      if (!rg) {
        return {
          ok: false,
          issue: {
            index: i,
            code: 'UNFINISHED_REGEX',
          },
        };
      }
      i = rg.end;
      lastWasValue = true;
      lastWasOperator = false;
      continue;
    }

    // TERM (bare)
    if (isTermChar(ch)) {
      i = skipTerm(input, i);
      lastWasValue = true;
      lastWasOperator = false;
      continue;
    }

    // Fallback: advance
    i++;
  }

  if (parenDepth !== 0) {
    return {
      ok: false,
      issue: {
        index: n,
        code: 'UNBALANCED_PARENS',
      },
    };
  }

  if (lastWasOperator) {
    return {
      ok: false,
      issue: {
        index: n,
        code: 'DANGLING_OPERATOR',
      },
    };
  }

  return { ok: true };
}
