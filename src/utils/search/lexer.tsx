// src/utils/search/lexer.ts
import { dbgParse } from '../debugging/debug';
import { Position, RegexInfo, Token } from './types';

export function noMatchRegex(): RegexInfo {
  return { pattern: '(?!)', flags: '', raw: '/(?!)/' };
}

export function isWhitespace(ch: string) { return /\s/.test(ch); }
export function isPunct(ch: string) { return /[():~]/.test(ch); }

function isBoundary(prev: string | undefined) {
  return prev === undefined || isWhitespace(prev) || isPunct(prev) || prev === '"';
}

function readQuoted(input: string, startIndex: number) {
  // Expects input[startIndex] === '"'. Returns { end, value } if closed; null otherwise.
  let j = startIndex + 1;
  const n = input.length;
  let buf = '';
  let escaped = false;
  while (j < n) {
    const c = input[j++];
    if (escaped) { buf += c; escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { return { end: j, value: buf }; }
    buf += c;
  }
  return null; // no closing quote
}

export function readRegex(input: string, startIndex: number) {
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
      // When reading regex flags, stop only at whitespace
      while (i < n && !isWhitespace(input[i])) flags += input[i++];
      const raw = input.slice(startIndex, i);

      // Validate that regex flags contain only allowed JavaScript flags
      const validFlags = 'gimsyu';
      if ([...flags].some(f => !validFlags.includes(f))) {
        // Produce a REGEX token that will match nothing
        return { end: i, token: noMatchRegex() };
      }

      const pattern = input.slice(startIndex + 1, bodyEnd);
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
      const q = readQuoted(input, i);
      if (q) {
        push({ kind: 'PHRASE', value: q.value, pos: { start, end: q.end } });
        i = q.end;
        continue;
      }
      // no closing quote → fall through to TERM logic
    }

    if (ch === '(') { i++; push({ kind: 'LPAREN', pos: { start, end: i } }); continue; }
    if (ch === ')') { i++; push({ kind: 'RPAREN', pos: { start, end: i } }); continue; }
    if (ch === '-') { i++; push({ kind: 'MINUS', pos: { start, end: i } }); continue; }
    if (ch === ':') {
      const prev = i > 0 ? input[i - 1] : undefined;
      const atBoundary = isBoundary(prev);

      if (atBoundary) {
        // Treat leading ':' or a ':' immediately after a closing quote as a literal term start
        let buf = ':';
        i++;
        while (i < n) {
          const c = input[i];
          if (isWhitespace(c) || isPunct(c)) break;
          buf += c; i++;
        }
        push({ kind: 'TERM', value: buf, pos: { start, end: i } });
        continue;
      } else {
        i++;
        push({ kind: 'COLON', pos: { start, end: i } });
        continue;
      }
    }
    if (ch === '~') { i++; push({ kind: 'TILDE', pos: { start, end: i } }); continue; }

    if (isWhitespace(ch)) {
      while (i < n && isWhitespace(input[i])) i++;
      push({ kind: 'WS', pos: { start, end: i } });
      continue;
    }

    // Bare term: read until whitespace or punctuation we treat as separator.
    // If we encounter '"' and it begins a valid phrase, stop so the phrase handler can consume it.
    let buf = '';
    while (i < n) {
      const c = input[i];
      if (isWhitespace(c) || isPunct(c)) break;

      if (c === '"') {
        const q = readQuoted(input, i);
        if (q) break; // let phrase branch handle it next
        // else treat '"' as literal within the term
      }

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
  dbgParse('[tokenize] normalized tokens:', normalized);
  return normalized;
}