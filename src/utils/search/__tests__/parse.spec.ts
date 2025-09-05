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
    const ast = parseQuery('key:"sdf fasd"');
    const t = terms(ast)[0];
    expect(t).toMatchObject({
      field: 'key',
      value: 'sdf fasd',
      phrase: true,
    });
  });

  it('treats :note as literal term (no field)', () => {
    const ast = parseQuery(':note');
    const t = terms(ast)[0];
    expect(t).toMatchObject({
      field: undefined,
      value: ':note',
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