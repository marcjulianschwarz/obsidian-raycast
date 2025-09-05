import { tokenize } from '../lexer';

function KVs(toks: any[]) {
  return toks.map((t: any) => ({ kind: t.kind, value: t.value }));
}

describe('lexer', () => {
  it('quotes take precedence over whitespace', () => {
    const toks = tokenize('abc "def"x" "cx ab"');
    expect(KVs(toks)).toEqual([
      { kind: 'TERM',   value: 'abc' },
      { kind: 'PHRASE', value: 'def' },
      { kind: 'TERM',   value: 'x' },      // quote without closer ahead = literal inside TERM
      { kind: 'PHRASE', value: ' ' },      // quoted single space
      { kind: 'PHRASE', value: 'cx ab' },  // quoted phrase
    ]);
  });

  it('fielded quoted value after colon', () => {
    const toks = tokenize('key:"sdf fasd"');
    expect(KVs(toks)).toEqual([
      { kind: 'TERM',   value: 'key' },
      // depending on your lexer, this may be COLON+PHRASE or synthetic TERM in parser; here we assert lexer-level:
      // COLON token should exist:
      { kind: 'COLON',  value: undefined },
      { kind: 'PHRASE', value: 'sdf fasd' },
    ]);
  });

  it('leading colon and :term are literal terms', () => {
    expect(KVs(tokenize(':'))).toEqual([{ kind: 'TERM', value: ':' }]);
    expect(KVs(tokenize(':note'))).toEqual([{ kind: 'TERM', value: ':note' }]);
  });

  it('colon right after closing quote is literal term start', () => {
    const toks = tokenize('"term":test');
    expect(KVs(toks)).toEqual([
      { kind: 'PHRASE', value: 'term' },
      { kind: 'TERM',   value: ':test' }, // not a field separator
    ]);
  });
});