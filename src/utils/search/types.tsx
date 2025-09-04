// src/utils/search/types.ts

export type Position = { start: number; end: number };

export type RegexInfo = { pattern: string; flags: string; raw: string };

// Lexer tokens
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