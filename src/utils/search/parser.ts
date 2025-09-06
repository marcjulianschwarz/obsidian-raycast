import { dbgParse, j } from '../debugging/debugger';
import { validateQuerySyntax } from './validator';

// Move shared types & lexer helpers to dedicated modules
import { Position, RegexInfo, Token } from './types';
import { tokenize, readRegex, noMatchRegex } from './lexer';

/*
 * Obsidian-style search parser → AST (TypeScript)
 * Supports:
 *  - Terms and quoted phrases
 *  - Fielded terms: tag:foo, path:"notes/", title:Bar
 *  - Negation with leading '-'
 *  - Parentheses for grouping
 *  - Boolean operators: AND, OR (case-insensitive). Default operator is AND.
 *  - Per-term fuzzy suffix: term~ or "phrase"~ (flag only; execution layer decides behavior)
 *  - To use regular expressions in your search term, surround the expression with forward slashes (/).
 */

// Normalize special field semantics (parser-only)
function normalizeSpecialField(
  field: string | undefined,
  raw: string,
  phrase: boolean
): { raw: string; phrase: boolean } {
  if (!field || field.toLowerCase() !== 'bookmarked') return { raw, phrase };

  // Empty: bookmarked:  -> true
  // Empty quoted: bookmarked:"" -> false
  if (raw === '') {
    return { raw: phrase ? 'false' : 'true', phrase };
  }

  // Synonyms for presence/true (unquoted)
  const lc = raw.toLowerCase().trim();
  if (!phrase && (lc === 'has' || lc === 'exists')) {
    return { raw: 'true', phrase };
  }

  return { raw, phrase };
}

export type TermNode = {
  type: 'Term';
  field?: string;        // e.g., 'tag', 'path', 'title', or frontmatter key
  value: string;         // raw value (without quotes)
  phrase: boolean;       // true if originally quoted
  fuzzy: boolean;        // true if token had trailing '~'
  regex?: RegexInfo | null;
  pos: Position;
};

export type NotNode = {
  type: 'Not';
  child: ASTNode;
  pos: Position;
};

export type AndNode = {
  type: 'And';
  children: ASTNode[];   // flattened list (at least 2)
  pos: Position;
};

export type OrNode = {
  type: 'Or';
  children: ASTNode[];   // flattened list (at least 2)
  pos: Position;
};

export type GroupNode = {
  type: 'Group';
  child: ASTNode | null; // may be null if group is empty (rare/invalid)
  pos: Position;
};

export type ASTNode = TermNode | NotNode | AndNode | OrNode | GroupNode;

// ————————————————————————————————————————————————————————————
// Parser (recursive descent)
// Precedence: NOT > AND (implicit or explicit) > OR
// ————————————————————————————————————————————————————————————

class Parser {
  private i = 0;
  constructor(private toks: Token[], private input: string) { }

  private peek(k = 0): Token | undefined { return this.toks[this.i + k]; }
  private eat(kind?: Token['kind']): Token | undefined {
    const t = this.toks[this.i];
    if (!t) return undefined;
    if (kind && t.kind !== kind) return undefined;
    this.i++; return t;
  }

  private findValueEnd(startPos: number): number {
    const s = this.input;
    let i = startPos;
    while (i < s.length && !/\s/.test(s[i])) i++;
    return i;
  }

  private findQuotedValueEnd(startPos: number): number | null {
    // Expects input[startPos] === '"'; returns the index AFTER the closing quote, or null if not found
    const s = this.input;
    let i = startPos + 1;
    let escaped = false;
    while (i < s.length) {
      const c = s[i++];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { return i; }
    }
    return null; // no closing quote
  }

  private isAdjacent(endA: number, startB: number | undefined): boolean {
    return typeof startB === 'number' && startB === endA;
  }

  /**
   * Resolve field and value token for a term.
   * - Handles bare '~' literal
   * - Detects TERM COLON adjacency to form a field
   * - Creates synthetic TERM for value slices (quoted-after-colon or whitespace-delimited)
   */
  private resolveFieldAndValue(first: Token): {
    field?: string;
    valueTok: Token;
    isBareTildeLiteral: boolean;
    startTok: Token;
  } {
    let field: string | undefined;
    let valueTok: Token = first;
    let isBareTildeLiteral = false;
    const startTok = first;

    if (first.kind === 'TILDE') {
      // Treat standalone '~' as a literal value token
      isBareTildeLiteral = true;
      valueTok = { kind: 'TERM', value: '~', pos: first.pos } as any;
      return { field, valueTok, isBareTildeLiteral, startTok };
    }

    if (first.kind === 'TERM' && this.peek()?.kind === 'COLON') {
      field = (first as any).value;
      const colonTok = this.eat('COLON')!;
      const next = this.peek();
      const adjacent = this.isAdjacent(colonTok.pos.end, next?.pos.start);

      if (adjacent) {
        const valueStart = colonTok.pos.end;
        let valueEnd: number;
        if (this.input[valueStart] === '"') {
          const quotedEnd = this.findQuotedValueEnd(valueStart);
          valueEnd = quotedEnd != null ? quotedEnd : this.findValueEnd(valueStart);
        } else {
          valueEnd = this.findValueEnd(valueStart);
        }
        const rawSlice = this.input.slice(valueStart, valueEnd);
        while (this.peek() && (this.peek() as any).pos.start < valueEnd) this.eat();
        valueTok = { kind: 'TERM', value: rawSlice, pos: { start: valueStart, end: valueEnd } } as any;
      } else {
        // Empty value for this field; keep next token for subsequent term
        valueTok = { kind: 'TERM', value: '', pos: next ? next.pos : first.pos } as any;
      }
    }

    return { field, valueTok, isBareTildeLiteral, startTok };
  }

  /**
   * Convert a value token into raw text / phrase flag / regex info.
   * - Preserves PHRASE tokens as phrase=true
   * - Detects synthetically quoted TERM ("...")
   * - Detects regex literals that span exactly the token
   */
  private coerceValueFromToken(valueTok: Token): { raw: string; phrase: boolean; regexInfo: RegexInfo | null } {
    let raw = '';
    let phrase = false;
    let regexInfo: RegexInfo | null = null;

    if (valueTok.kind === 'REGEX') {
      raw = (valueTok as any).raw;
      regexInfo = { pattern: (valueTok as any).pattern, flags: (valueTok as any).flags, raw: (valueTok as any).raw };
      return { raw, phrase, regexInfo };
    }

    if (valueTok.kind === 'PHRASE') {
      raw = (valueTok as any).value ?? '';
      phrase = true;
      return { raw, phrase, regexInfo };
    }

    // TERM
    raw = (valueTok as any).value ?? '';
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      phrase = true;
      raw = raw.slice(1, -1);
      return { raw, phrase, regexInfo };
    }

    // Regex literal if TERM starts with '/' and spans token
    if (raw.startsWith('/')) {
      const rr = readRegex(this.input, (valueTok as any).pos.start);
      if (rr && rr.end === (valueTok as any).pos.end) {
        regexInfo = { pattern: rr.token.pattern, flags: rr.token.flags, raw: rr.token.raw };
        raw = rr.token.raw;
      }
    }

    return { raw, phrase, regexInfo };
  }

  private parseFuzzyOperator(
    rawIn: string,
    valueTok: Token,
    regexInfo: RegexInfo | null,
    isBareTildeLiteral: boolean
  ): { raw: string; fuzzy: boolean; endPos: number } {
    let raw = rawIn;
    let fuzzy = false;
    let endPos = (valueTok as any).pos?.end ?? (valueTok as any).pos?.end;

    // Do not treat '~' as operator when it's a bare literal or exactly "~"
    if (isBareTildeLiteral || raw === '~') {
      return { raw, fuzzy, endPos };
    }

    // Case A: raw value itself ends with '~' (e.g., key:value~ or key:"phrase"~)
    if (raw.length > 1 && raw.endsWith('~')) {
      fuzzy = true;
      raw = raw.slice(0, -1);
      return { raw, fuzzy, endPos };
    }

    // Case B: adjacent standalone '~' token (e.g., value~ or "phrase"~)
    const nextTok = this.peek();
    if (
      !regexInfo &&
      raw.length > 0 &&
      nextTok?.kind === 'TILDE' &&
      nextTok.pos.start === (valueTok as any).pos.end
    ) {
      this.eat('TILDE');
      fuzzy = true;
      endPos = nextTok.pos.end;
    }

    return { raw, fuzzy, endPos };
  }

  parse(): ASTNode | GroupNode {
    const node = this.parseOr();
    dbgParse('parse, final AST:', j(node));
    // If multiple top-level nodes without OR, we already handled as AND inside parseAnd
    return node;
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.peek()?.kind === 'OR') {
      const start = (left as any).pos.start;
      this.eat('OR');
      const right = this.parseAnd();
      const pos: Position = { start, end: (right as any).pos.end };
      if (left.type === 'Or') {
        left = { type: 'Or', children: [...left.children, right], pos };
      } else {
        left = { type: 'Or', children: [left, right], pos };
      }
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseUnary();
    // AND is implicit: keep consuming while the next token starts a unary
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'RPAREN' || t.kind === 'OR') break;
      // If next token logically could start another clause, combine as AND
      const next = this.parseUnary();
      const pos: Position = { start: (left as any).pos.start, end: (next as any).pos.end };
      if (left.type === 'And') {
        left = { type: 'And', children: [...left.children, next], pos };
      } else {
        left = { type: 'And', children: [left, next], pos };
      }
    }
    return left;
  }

  private parseUnary(): ASTNode {
    const t = this.peek();
    if (!t) {
      // empty query -> empty group
      return { type: 'Group', child: null, pos: { start: 0, end: 0 } };
    }
    if (t.kind === 'MINUS') {
      const neg = this.tryParseNegation();
      if (neg) return neg;
    }
    if (t.kind === 'LPAREN') {
      const start = t.pos.start; this.eat('LPAREN');
      const inner = this.peek()?.kind === 'RPAREN' ? null : this.parseOr();
      const endTok = this.eat('RPAREN');
      const end = endTok ? endTok.pos.end : (inner as any)?.pos.end ?? start + 1;
      return { type: 'Group', child: inner!, pos: { start, end } };
    }
    // if (t.kind === 'TILDE') {
    //   // Standalone '~' → treat as no-match (power-user strict)
    //   const start = t.pos.start;
    //   this.eat('TILDE');
    //   return {
    //     type: 'Term',
    //     field: undefined,
    //     value: '',
    //     phrase: false,
    //     fuzzy: false,
    //     regex: noMatchRegex(),
    //     pos: { start, end: t.pos.end },
    //   };
    // }
    return this.parseTerm();
  }

  /**
   * Simplified '-' handling:
   * - If input starts with '-', negate the following unary expression.
   * - Lone '-' (no following token) is treated as a literal term "-".
   */
  private tryParseNegation(): ASTNode | null {
    const t = this.peek();
    if (!t || t.kind !== 'MINUS') return null;
    const minusTok = this.eat('MINUS')!;
    const next = this.peek();
  
    // Lone '-' → literal term
    if (!next) {
      return {
        type: 'Term',
        field: undefined,
        value: '-',
        phrase: false,
        fuzzy: false,
        regex: null,
        pos: { start: minusTok.pos.start, end: minusTok.pos.end },
      } as TermNode;
    }
  
    // Otherwise, '-' negates the next unary expression (covers -val, -key:val, -"phrase", -key:"phrase", -( ... ), -/re/, -~, --dash, etc.)
    const child = this.parseUnary();
    return {
      type: 'Not',
      child,
      pos: { start: minusTok.pos.start, end: (child as any).pos.end },
    } as NotNode;
  }

  private parseTerm(): TermNode {
    // Consume first token of the term
    const startTok = this.peek();
    if (!startTok) throw new Error('Unexpected end of input while parsing term');
    let first = this.eat();
    if (!first) throw new Error('Unexpected end of input');

    // Centralized resolution of field and value
    const { field, valueTok, isBareTildeLiteral, startTok: startForPos } = this.resolveFieldAndValue(first);

    // Map value token → raw / phrase / regex
    const v = this.coerceValueFromToken(valueTok);
    let raw = v.raw;
    let phrase = v.phrase;
    let regexInfo: RegexInfo | null = v.regexInfo;

    // Fuzzy operator handling (suffix '~' or adjacent TILDE token)
    const fuzzyRes = this.parseFuzzyOperator(raw, valueTok, regexInfo, isBareTildeLiteral);
    raw = fuzzyRes.raw;
    const fuzzy = fuzzyRes.fuzzy;
    let endPos = fuzzyRes.endPos;

    ({ raw, phrase } = normalizeSpecialField(field, raw, phrase));

    // If phrase is empty and fuzzy is true → set no-match regex (preserve fuzzy flag)
    if (phrase && raw === '' && fuzzy) {
      regexInfo = noMatchRegex();
    }

    // Default end position: value token end (if fuzzy didn't extend it)
    if (!endPos) endPos = (valueTok as any).pos?.end ?? (startForPos as any).pos.end;

    dbgParse('parseTerm, term parsed:', { field, raw, phrase, fuzzy, regexInfo });

    return {
      type: 'Term',
      field,
      value: raw,
      phrase,
      fuzzy,
      regex: regexInfo,
      pos: { start: (startForPos as any).pos.start, end: endPos },
    } as TermNode;
  }
}

// Public API
export function parseQuery(input: string): ASTNode {
  dbgParse('parseQuery, input:', input);

  // 1) Pre-validate: if invalid, quietly return an empty AST (no toasts)
  const v = validateQuerySyntax(input);
  dbgParse('parseQuery, validation result:', v);
  if (!(v as any).ok) {
    return { type: 'Group', child: null, pos: { start: 0, end: 0 } } as GroupNode;
  }

  const toks = tokenize(input);
  dbgParse('parseQuery, tokens:', toks);
  const p = new Parser(toks, input);
  const ast = p.parse();
  dbgParse('parseQuery, AST output:', j(ast));
  return ast;
}

// ————————————————————————————————————————————————————————————
// Helpers for debugging / testing
// ————————————————————————————————————————————————————————————

export function astToString(node: ASTNode): string {
  dbgParse('astToString, node:', node);
  switch (node.type) {
    case 'Term': {
      const f = node.field ? `${node.field}:` : '';
      // If it's a true regex node (and not the fuzzy-literal case), print its raw regex.
      const v = node.regex
        ? node.regex.raw
        : (node.phrase ? `"${node.value}"` : node.value);
      const tilde = node.fuzzy ? '~' : '';
      return `${f}${v}${tilde}`;
    }
    case 'Not':
      return `-( ${astToString(node.child)} )`;
    case 'And':
      return node.children.map(astToString).join(' AND ');
    case 'Or':
      return `(${node.children.map(astToString).join(' OR ')})`;
    case 'Group':
      return `( ${node.child ? astToString(node.child) : ''} )`;
  }
}

// Quick sanity checks (remove or guard behind NODE_ENV in production)
// Example:
// console.log(JSON.stringify(parseQuery('(term1 OR -term2) term3'), null, 2));
// console.log(astToString(parseQuery('tag:JDex coat~ -serious title:"Hello Kitty"~')));

// const debugAST = parseQuery("title:/.*intro/");
// console.log(JSON.stringify(debugAST, null, 2));