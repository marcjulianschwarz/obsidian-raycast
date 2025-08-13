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

type RegexInfo = { pattern: string; flags: string; raw: string };
export type Position = { start: number; end: number };

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
// Lexer
// ————————————————————————————————————————————————————————————

export type Token =
  | { kind: 'LPAREN'; pos: Position }
  | { kind: 'RPAREN'; pos: Position }
  | { kind: 'AND'; pos: Position }
  | { kind: 'OR'; pos: Position }
  | { kind: 'MINUS'; pos: Position } // unary NOT
  | { kind: 'COLON'; pos: Position }
  | { kind: 'TERM'; value: string; pos: Position }
  | { kind: 'PHRASE'; value: string; pos: Position }
  | { kind: 'TILDE'; pos: Position }
  | { kind: 'REGEX'; pattern: string; flags: string; raw: string; pos: Position }
  | { kind: 'WS'; pos: Position };

function isWhitespace(ch: string) { return /\s/.test(ch); }
function isPunct(ch: string) { return /[():~]/.test(ch); }

function readRegex(input: string, startIndex: number) {
  // expects input[startIndex] === '/'
  let i = startIndex + 1;
  const n = input.length;
  let escaped = false;

  while (i < n) {
    const c = input[i++];
    if (!escaped && c === '/') {
      // found terminating '/'
      const bodyEnd = i - 1; // char before the slash
      // collect flags
      let flags = '';
      while (i < n && !isWhitespace(input[i])) flags += input[i++];
      const raw = input.slice(startIndex, i);
      const validFlags = 'gimsyu';
      if ([...flags].some(f => !validFlags.includes(f))) {
        // Produce a REGEX token that will match nothing
        return { end: i, token: { pattern: '(?!)', flags: '', raw } };
      }
      const pattern = input.slice(startIndex + 1, bodyEnd); // ← untouched body
      return { end: i, token: { pattern, flags, raw } };
    }
    escaped = !escaped && c === '\\';
  }
  // no closing slash → not a regex
  return null;
}

export function tokenize(input: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = input.length;
  const push = (t: Token) => toks.push(t);

  while (i < n) {
    const start = i;
    const ch = input[i];

    // Regex literal: /pattern/flags  (JS-flavored)
    if (ch === '/') {
      const rr = readRegex(input, i);
      if (rr) {
        i = rr.end;
        push({ kind: 'REGEX', pattern: rr.token.pattern, flags: rr.token.flags, raw: rr.token.raw, pos: { start, end: i } });
        continue;
      }
      // fall through if not a valid /regex/
    }

    if (ch === '"') {
      // Quoted phrase (supports \" escapes)
      i++; // skip opening quote
      let buf = '';
      let escaped = false;
      while (i < n) {
        const c = input[i++];
        if (escaped) { buf += c; escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { break; }
        buf += c;
      }
      push({ kind: 'PHRASE', value: buf, pos: { start, end: i } });
      continue;
    }

    if (ch === '(') { i++; push({ kind: 'LPAREN', pos: { start, end: i } }); continue; }
    if (ch === ')') { i++; push({ kind: 'RPAREN', pos: { start, end: i } }); continue; }
    if (ch === '-') { i++; push({ kind: 'MINUS', pos: { start, end: i } }); continue; }
    if (ch === ':') { i++; push({ kind: 'COLON', pos: { start, end: i } }); continue; }
    if (ch === '~') { i++; push({ kind: 'TILDE', pos: { start, end: i } }); continue; }

    if (isWhitespace(ch)) {
      while (i < n && isWhitespace(input[i])) i++;
      push({ kind: 'WS', pos: { start, end: i } });
      continue;
    }

    // Bare term: read until whitespace or a punctuation we treat as separator
    let buf = '';
    while (i < n) {
      const c = input[i];
      if (isWhitespace(c) || isPunct(c)) break;
      buf += c; i++;
    }
    push({ kind: 'TERM', value: buf, pos: { start, end: i } });
  }

  // Map keywords AND/OR (case-insensitive) and drop WS for the parser convenience
  const normalized: Token[] = [];
  for (const t of toks) {
    if (t.kind === 'TERM') {
      const v = t.value.toUpperCase();
      if (v === 'AND') { normalized.push({ kind: 'AND', pos: t.pos }); continue; }
      if (v === 'OR') { normalized.push({ kind: 'OR', pos: t.pos }); continue; }
    }
    if (t.kind !== 'WS') normalized.push(t);
  }
  return normalized;
}

// ————————————————————————————————————————————————————————————
// Parser (recursive descent)
// Precedence: NOT > AND (implicit or explicit) > OR
// ————————————————————————————————————————————————————————————

class Parser {
  private i = 0;
  constructor(private toks: Token[]) { }

  private peek(k = 0): Token | undefined { return this.toks[this.i + k]; }
  private eat(kind?: Token['kind']): Token | undefined {
    const t = this.toks[this.i];
    if (!t) return undefined;
    if (kind && t.kind !== kind) return undefined;
    this.i++; return t;
  }

  parse(): ASTNode | GroupNode {
    const node = this.parseOr();
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
      const start = t.pos.start;
      this.eat('MINUS');
      const child = this.parseUnary();
      return { type: 'Not', child, pos: { start, end: (child as any).pos.end } };
    }
    if (t.kind === 'LPAREN') {
      const start = t.pos.start; this.eat('LPAREN');
      const inner = this.peek()?.kind === 'RPAREN' ? null : this.parseOr();
      const endTok = this.eat('RPAREN');
      const end = endTok ? endTok.pos.end : (inner as any)?.pos.end ?? start + 1;
      return { type: 'Group', child: inner!, pos: { start, end } };
    }
    return this.parseTerm();
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
    let expectValue = false;
    if (first.kind === 'TERM' && this.peek()?.kind === 'COLON') {
      // field present
      field = (first as any).value;
      this.eat('COLON');
      const next = this.peek();
      if (next && (next.kind === 'TERM' || next.kind === 'PHRASE' || next.kind === 'REGEX')) {
        valueTok = this.eat()!; // consume value token
      } else {
        // Empty value allowed? We'll treat as empty term.
        valueTok = { kind: 'TERM', value: '', pos: next ? next.pos : first.pos } as any;
      }
    }

    let phrase = false;
    let raw = '';
    let endPos = valueTok.pos.end;
    let regexInfo: RegexInfo | null = null;

    if (valueTok.kind === 'PHRASE') {
      phrase = true;
      raw = valueTok.value;
    } else if (valueTok.kind === 'TERM') {
      raw = valueTok.value;
    } else if (valueTok.kind === 'REGEX') {
      // Tentatively treat as regex; final decision after we peek for '~'
      raw = valueTok.raw; // keep the literal for astToString/debug
      regexInfo = { pattern: valueTok.pattern, flags: valueTok.flags, raw: valueTok.raw };
    } else {
      throw new Error(`Unexpected token in term: ${valueTok.kind}`);
    }

    // optional trailing '~' to mark fuzzy for this term/phrase
    let fuzzy = false;
    if (this.peek()?.kind === 'TILDE') {
      this.eat('TILDE');
      endPos = this.peek()?.pos.start ?? (endPos + 1);
    }

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
  const toks = tokenize(input);
  const p = new Parser(toks);
  const ast = p.parse();
  return ast;
}

// ————————————————————————————————————————————————————————————
// Helpers for debugging / testing
// ————————————————————————————————————————————————————————————

export function astToString(node: ASTNode): string {
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