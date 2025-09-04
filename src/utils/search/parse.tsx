import { dbgParse, j } from '../debugging/debug';
import { validateQuerySyntax } from './validate';

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

  private applyFuzzyOperator(
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
    dbgParse('[Parser.parse] final AST:', j(node));
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
    // A term can be: [field ':'] (TERM|PHRASE) ['~']
    const startTok = this.peek();
    if (!startTok) throw new Error('Unexpected end of input while parsing term');

    // Attempt field detection: TERM ':' ahead and then value
    let field: string | undefined;
    let first = this.eat();
    if (!first) throw new Error('Unexpected end of input');

    let valueTok = first;
    let isBareTildeLiteral = false;

    // If the first token is a bare '~', treat it as a literal term
    if (first.kind === 'TILDE') {
      isBareTildeLiteral = true;
      valueTok = { kind: 'TERM', value: '~', pos: first.pos } as any;
    }

    if (first.kind === 'TERM' && this.peek()?.kind === 'COLON') {
      // field present
      field = (first as any).value;
      const colonTok = this.eat('COLON')!;
      const next = this.peek();

      // Attach value only if immediately adjacent to ':' (no whitespace).
      const isAdjacent = !!(next && next.pos.start === colonTok.pos.end);

      if (isAdjacent) {
        const valueStart = colonTok.pos.end;
        const valueEnd = this.findValueEnd(valueStart);
        const rawSlice = this.input.slice(valueStart, valueEnd);

        // Advance tokenizer index to skip all tokens covered by the raw slice
        while (this.peek() && (this.peek() as any).pos.start < valueEnd) {
          this.eat();
        }

        // Create a synthetic TERM token carrying the raw slice and positions
        valueTok = { kind: 'TERM', value: rawSlice, pos: { start: valueStart, end: valueEnd } } as any;
      } else {
        // Empty value for this field; leave next token untouched
        valueTok = { kind: 'TERM', value: '', pos: next ? next.pos : first.pos } as any;
      }
    }

    let phrase = false;
    let raw = '';
    let fuzzy = false;
    let regexInfo: RegexInfo | null = null;
    let endPos = valueTok.pos.end;

    if (valueTok.kind === 'REGEX') {
      // Keep existing behavior for standalone regex tokens
      raw = (valueTok as any).raw;
      regexInfo = { pattern: (valueTok as any).pattern, flags: (valueTok as any).flags, raw: (valueTok as any).raw };
    } else if (valueTok.kind === 'PHRASE' || valueTok.kind === 'TERM') {
      raw = (valueTok as any).value ?? '';
    } else {
      throw new Error(`Unexpected token in term: ${valueTok.kind}`);
    }

    // Centralized fuzzy operator handling (covers key:value~, value~, key:"phrase"~, "phrase"~)
    const fuzzyRes = this.applyFuzzyOperator(raw, valueTok, regexInfo, isBareTildeLiteral);
    raw = fuzzyRes.raw;
    fuzzy = fuzzyRes.fuzzy;
    endPos = fuzzyRes.endPos;

    // 2) Quoted phrase if the (possibly de-tilde'd) raw is enclosed in double-quotes
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      phrase = true;
      raw = raw.slice(1, -1);
    }

    // 3) Regex literal if raw starts with '/' — validate with readRegex on the original input slice
    if (!phrase && raw.startsWith('/')) {
      const startInInput = (valueTok as any).pos.start;
      const rr = readRegex(this.input, startInInput);
      if (rr && rr.end === (valueTok as any).pos.end) {
        regexInfo = { pattern: rr.token.pattern, flags: rr.token.flags, raw: rr.token.raw };
        // Keep raw as rr.token.raw for ast/debug consistency
        raw = rr.token.raw;
      }
    }

    // Special case: `bookmarked:` → treat as `bookmarked:true`
    if (field && field.toLowerCase() === 'bookmarked' && raw === '') {
      raw = 'true';
    }

    // optional trailing '~' has already been handled inside `raw` processing above
    // Handle the special case: empty quoted phrase + '~' → no-match regex
    if (phrase && raw === '' && fuzzy) {
      regexInfo = noMatchRegex();
      // Keep `fuzzy` true for AST flagging, but execution can treat regex as no-match.
    }

    endPos = (valueTok as any).pos?.end ?? endPos;

    dbgParse('[Parser.parseTerm] term parsed:', { field, raw, phrase, fuzzy, regexInfo });

    return {
      type: 'Term',
      field,
      value: raw,
      phrase,
      fuzzy,
      regex: regexInfo,
      pos: { start: startTok.pos.start, end: endPos },
    };
  }
}

// Public API
export function parseQuery(input: string): ASTNode {
  dbgParse('[parseQuery] input:', input);

  // 1) Pre-validate: if invalid, quietly return an empty AST (no toasts)
  // const v = validateQuerySyntax(input);
  // dbgParse('[parseQuery) validation result:', v);
  // if (!(v as any).ok) {
  //   return { type: 'Group', child: null, pos: { start: 0, end: 0 } } as GroupNode;
  // }

  const toks = tokenize(input);
  dbgParse('[parseQuery] tokens:', toks);
  const p = new Parser(toks, input);
  const ast = p.parse();
  dbgParse('[parseQuery] AST output:', j(ast));
  return ast;
}

// ————————————————————————————————————————————————————————————
// Helpers for debugging / testing
// ————————————————————————————————————————————————————————————

export function astToString(node: ASTNode): string {
  dbgParse('[astToString] node:', node);
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