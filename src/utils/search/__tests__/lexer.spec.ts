import { tokenize } from '../lexer';

function KVs(toks: any[]) {
  return toks.map((t: any) => ({ kind: t.kind, value: t.value }));
}

describe('lexer', () => {
  it('quotes take precedence over whitespace', () => {
    // quotes take precedence over whitespace splitting
    const toks = tokenize('abc "def"g" "hi jk"');
    expect(KVs(toks)).toEqual([
      { kind: 'TERM', value: 'abc' },
      { kind: 'PHRASE', value: 'def' },
      { kind: 'TERM', value: 'g' },
      { kind: 'PHRASE', value: ' ' },
      { kind: 'TERM', value: 'hi' },
      { kind: 'TERM', value: 'jk"' },
    ]);
  });

  it('fielded quoted value after colon', () => {
    const toks = tokenize('key:"abc def"');
    expect(KVs(toks)).toEqual([
      { kind: 'TERM', value: 'key' },
      // depending on your lexer, this may be COLON+PHRASE or synthetic TERM in parser; here we assert lexer-level:
      // COLON token should exist:
      { kind: 'COLON', value: undefined },
      { kind: 'PHRASE', value: 'abc def' },
    ]);
  });

  it('leading colon and :term are literal terms', () => {
    expect(KVs(tokenize(':'))).toEqual([
      { kind: 'TERM', value: ':' }]);
    expect(KVs(tokenize(':test'))).toEqual([
      { kind: 'TERM', value: ':test' }]);
  });

  it('colon right after closing quote is literal term start', () => {
    const toks = tokenize('"term":test');
    expect(KVs(toks)).toEqual([
      { kind: 'PHRASE', value: 'term' },
      { kind: 'TERM', value: ':test' }, // not a field separator
    ]);
  });
});