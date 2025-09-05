import { parseQuery } from '../parse';

function terms(ast: any) {
  if (ast.type === 'And') return ast.children;
  if (ast.type === 'Term') return [ast];
  return [];
}

describe('parse', () => {
  it('marks phrases as phrase=true', () => {
    const ast = parseQuery('abc "def"');
    const ts = terms(ast);
    expect(ts[0]).toMatchObject({ value: 'abc', phrase: false });
    expect(ts[1]).toMatchObject({ value: 'def', phrase: true });
  });

  it('fielded quoted values stay intact', () => {
    const ast = parseQuery('key:"abc def"');
    const t = terms(ast)[0];
    expect(t).toMatchObject({
      field: 'key',
      value: 'abc def',
      phrase: true,
    });
  });

  it('treats :test as literal term (no field)', () => {
    const ast = parseQuery(':test');
    const t = terms(ast)[0];
    expect(t).toMatchObject({
      field: undefined,
      value: ':test',
      phrase: false,
    });
  });

  it('colon after closing quote does not open field', () => {
    const ast = parseQuery('"term":test');
    const ts = terms(ast);
    expect(ts.length).toBe(2);
    expect(ts[0]).toMatchObject({ field: undefined, value: 'term', phrase: true });
    expect(ts[1]).toMatchObject({ field: undefined, value: ':test', phrase: false });
  });
});