import { parseQuery } from '../parser';

function terms(ast: any) {
    if (ast.type === 'And') return ast.children;
    if (ast.type === 'Term' || ast.type === 'FieldGroup') return [ast];
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

    it('normalizes bookmarked field semantics', () => {
        let t = terms(parseQuery('bookmarked:'))[0];
        expect(t).toMatchObject({ field: 'bookmarked', value: 'true', phrase: false });

        t = terms(parseQuery('bookmarked:""'))[0];
        expect(t).toMatchObject({ field: 'bookmarked', value: '', phrase: true });

        t = terms(parseQuery('bookmarked:has'))[0];
        expect(t).toMatchObject({ field: 'bookmarked', value: 'true', phrase: false });

        t = terms(parseQuery('bookmarked:exists'))[0];
        expect(t).toMatchObject({ field: 'bookmarked', value: 'true', phrase: false });
    });

    it('strips leading hash in explicit tag field', () => {
        const t = terms(parseQuery('tag:#work'))[0];
        expect(t).toMatchObject({ field: 'tag', value: 'work', phrase: false });
    });

    it('parses field-scoped groups', () => {
        const ast = parseQuery('tag:(foo OR bar)');
        const node = terms(ast)[0];
        expect(node.type).toBe('FieldGroup');
        expect(node.field).toBe('tag');
        expect(node.child?.type).toBe('Or');
        const childTerms = (node.child as any).children.filter((c: any) => c.type === 'Term');
        expect(childTerms.map((c: any) => ({ field: c.field, value: c.value }))).toEqual([
            { field: undefined, value: 'foo' },
            { field: undefined, value: 'bar' },
        ]);
    });

    it('parses standalone regex with flags', () => {
        const t = terms(parseQuery('/foo+/gi'))[0];
        expect(t).toMatchObject({
            field: undefined,
            regex: { pattern: 'foo+', flags: 'gi', raw: '/foo+/gi' },
        });
    });

    it('parses fielded regex', () => {
        const t = terms(parseQuery('tag:/ba(r|z)/'))[0];
        expect(t).toMatchObject({
            field: 'tag',
            regex: { pattern: 'ba(r|z)', flags: '', raw: '/ba(r|z)/' },
        });
    });
});
