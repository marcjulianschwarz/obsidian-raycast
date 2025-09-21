import { parseQuery } from '../parser';
import { evaluateQueryAST, type EvaluateOptions } from '../evaluator';
// at top of evaluate.spec.ts (or wherever your fixtures live)
import { type Doc } from '../evaluator';

export const DOC_BASE: Doc = {
    id: '/Users/exampleuser/JD/85-89_Test-Area-2/85_Test/85.10_Test/testme7.md',
    index: '[[85.10_Test]]',
    created: new Date('2025-09-04T22:37:26.956Z'),
    modified: new Date('2025-09-04T22:41:28.544Z'),
    test: 'ab "c',
    title: 'testme7',
    path: '/Users/exampleuser/JD/85-89_Test-Area-2/85_Test/85.10_Test/testme7.md',
    tags: [],
    content:
        '---\n' +
        'index: "[[85.10_Test]]"\n' +
        'created: \n' +
        'modified: \n' +
        'test: ma "b\n' +
        '---',
    bookmarked: false,
    aliases: [],
    locations: [],
} as const;

// Create numbered variants from the base fixture for focused tests
const variant = (n: number, overrides: Partial<Doc> = {}): Doc => {
    const num = String(n).padStart(2, "0"); // pad to 2 digits, adjust as needed
    return {
        ...DOC_BASE,
        id: DOC_BASE.id.replace(/testme\d+\.md$/, `testme${num}.md`),
        title: `testme${num}`,
        ...overrides,
    };
};

export const DOC_TESTME1 = variant(1); // base as-is
export const DOC_TESTME2 = variant(2, { test: 'hello"world' });
export const DOC_TESTME3 = variant(3, { tags: ['custom'] });
export const DOC_TESTME4 = variant(4, { tags: [] });
export const DOC_TESTME5 = variant(5, { title: 'reABC' }); // for regex test
export const DOC_TESTME6 = variant(6, { key: 'abc def' } as any); // fielded quoted value
export const DOC_TESTME7 = variant(7, { content: ':test' }); // literal ':'
export const DOC_TESTME8 = variant(8, { bookmarked: true });
export const DOC_TESTME9 = variant(9, { test: '~' });
export const DOC_TESTME10 = variant(10, { test: 'abc', content: 'x y' });
export const DOC_TESTME11 = variant(11, { content: ' x ' });
export const DOC_TESTME12 = variant(12, { tag: ['foo', 'bar'] } as any);
export const DOC_TESTME13 = variant(13, { tag: ['baz'] } as any);
export const DOC_TESTME14 = variant(14, { tags: ['alpha'], title: 'RegexNote.md' });
export const DOC_TESTME15 = variant(15, { tags: ['work', 'foo'] });
export const DOC_TESTME16 = variant(16, { tags: ['workshop'] });
export const DOC_TESTME17 = variant(17, { tags: ['nested/work'] });
export const DOC_TESTME18 = variant(18, { title: '', tags: [] });
export const DOC_TESTME19 = variant(19, { meta: 'value' } as any);
export const DOC_TESTME20 = variant(20, { meta: '' } as any);

const mkDoc = (base: Doc, overrides: Partial<Doc> = {}): Doc => ({
    ...base,
    ...overrides,
});

const TEST_OPTS = {
    defaultFields: ['title'],
} as const satisfies EvaluateOptions;

describe('evaluate', () => {
    it('matches fielded phrase with escaped quote (DOC_TESTME1)', () => {
        const ast = parseQuery('test:"ab \\"c"');
        const doc = mkDoc(DOC_TESTME1);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('matches when a double quote is included in key "test" value (DOC_TESTME2)', () => {
        const ast = parseQuery('test:hello"world');
        const doc = mkDoc(DOC_TESTME2);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('matches a document with a custom tag (DOC_TESTME3)', () => {
        const ast = parseQuery('tags:custom');
        const doc = mkDoc(DOC_TESTME3);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('does not match empty tags via tags:"" (DOC_TESTME4)', () => {
        const ast = parseQuery('tags:""');
        const doc = mkDoc(DOC_TESTME4);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits).toHaveLength(0);
    });

    it('regex literal matches (DOC_TESTME5)', () => {
        const ast = parseQuery('/re*/i');
        const doc = mkDoc(DOC_TESTME5);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('fielded quoted value after colon (DOC_TESTME6)', () => {
        const ast = parseQuery('key:"abc def"');
        const doc = mkDoc(DOC_TESTME6);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('treats a leading colon as a literal in a fielded value (DOC_TESTME7)', () => {
        const ast = parseQuery('content::test');
        const doc = mkDoc(DOC_TESTME7);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('normalizes bookmarked:has and bookmarked:exists to bookmarked:true (DOC_TESTME8)', () => {
        const doc = mkDoc(DOC_TESTME8);

        let ast = parseQuery('bookmarked:has');
        let res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);

        ast = parseQuery('bookmarked:exists');
        res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('bookmarked presence operators behave consistently', () => {
        const bookmarkedDoc = mkDoc(DOC_TESTME8);
        const unbookmarkedDoc = mkDoc(DOC_TESTME1);

        const queries = ['bookmarked:', 'bookmarked:any', 'bookmarked:true'];
        for (const q of queries) {
            const res = evaluateQueryAST(parseQuery(q), [bookmarkedDoc, unbookmarkedDoc], TEST_OPTS);
            const ids = res.hits.map(h => h.id);
            expect(ids).toContain(bookmarkedDoc.id);
            expect(ids).not.toContain(unbookmarkedDoc.id);
        }
        const emptyQuoted = evaluateQueryAST(parseQuery('bookmarked:""'), [bookmarkedDoc, unbookmarkedDoc], TEST_OPTS);
        expect(emptyQuoted.hits).toHaveLength(0);
        const falseRes = evaluateQueryAST(parseQuery('bookmarked:false'), [bookmarkedDoc, unbookmarkedDoc], TEST_OPTS);
        expect(falseRes.hits).toHaveLength(0);
    });

    it('match single ~ in field "field" (DOC_TESTME9)', () => {
        const ast = parseQuery('test:~');
        const doc = mkDoc(DOC_TESTME9);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('complex negation and OR grouping (DOC_TESTME10)', () => {
        const ast = parseQuery('-( title:test3 OR -test:abc )');
        const doc = mkDoc(DOC_TESTME10);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('match quoted whitespace (DOC_TESTME10)', () => {
        const ast = parseQuery('test:abc content:" "');
        const doc = mkDoc(DOC_TESTME10);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('show whitespaces are trimmed (DOC_TESTME10)', () => {
        const ast = parseQuery('-content:" "');
        const doc = mkDoc(DOC_TESTME11);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('evaluates field-scoped groups (DOC_TESTME12, DOC_TESTME13)', () => {
        const ast = parseQuery('tag:(foo OR qux)');
        const docMatch = mkDoc(DOC_TESTME12);
        const docMiss = mkDoc(DOC_TESTME13);
        const res = evaluateQueryAST(ast, [docMatch, docMiss], { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tag: (d) => (d as any).tag } });
        const hitIds = res.hits.map(h => h.id);
        expect(hitIds).toContain(docMatch.id);
        expect(hitIds).not.toContain(docMiss.id);
    });

    it('matches regex on default fields (DOC_TESTME14)', () => {
        const ast = parseQuery('/RegexNote/');
        const doc = mkDoc(DOC_TESTME14);
        const res = evaluateQueryAST(ast, [doc], { ...TEST_OPTS, defaultFields: ['title'] });
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('matches regex with flags on explicit field (DOC_TESTME14)', () => {
        const ast = parseQuery('file:/regexnote/i');
        const doc = mkDoc(DOC_TESTME14);
        const res = evaluateQueryAST(ast, [doc], { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { file: (d) => d.title } });
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('matches regex against tag field (DOC_TESTME12)', () => {
        const ast = parseQuery('tag:/fo+/');
        const doc = mkDoc(DOC_TESTME12);
        const res = evaluateQueryAST(ast, [doc], { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tag: (d) => (d as any).tag } });
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('matches tag field exactly (DOC_TESTME15)', () => {
        const ast = parseQuery('tag:work');
        const doc = mkDoc(DOC_TESTME15);
        const res = evaluateQueryAST(ast, [doc], { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tag: (d) => (d as any).tags } });
        expect(res.hits.map(h => h.id)).toContain(doc.id);
    });

    it('does not treat tag field as substring (DOC_TESTME16)', () => {
        const ast = parseQuery('tag:work');
        const doc = mkDoc(DOC_TESTME16);
        const res = evaluateQueryAST(ast, [doc], { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tag: (d) => (d as any).tags } });
        expect(res.hits.map(h => h.id)).not.toContain(doc.id);
    });

    it('matches tags field partially (DOC_TESTME16, DOC_TESTME17)', () => {
        const ast = parseQuery('tags:work');
        const docs = [mkDoc(DOC_TESTME16), mkDoc(DOC_TESTME17)];
        const res = evaluateQueryAST(ast, docs, { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tags: (d) => (d as any).tags } });
        const hitIds = res.hits.map(h => h.id);
        expect(hitIds).toContain(docs[0].id);
        expect(hitIds).toContain(docs[1].id);
    });

    it('file: behaves like file:any for virtual title (DOC_TESTME15, DOC_TESTME18)', () => {
        const ast = parseQuery('file:');
        const docs = [mkDoc(DOC_TESTME15), mkDoc(DOC_TESTME18)];
        const opts = { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { file: (d) => d.title } } satisfies EvaluateOptions;
        const res = evaluateQueryAST(ast, docs, opts);
        const ids = res.hits.map(h => h.id);
        expect(ids).toContain(docs[0].id);
        expect(ids).not.toContain(docs[1].id);
    });

    it('tags: behaves like tags:any for virtual tags (DOC_TESTME3, DOC_TESTME4)', () => {
        const ast = parseQuery('tags:');
        const docs = [mkDoc(DOC_TESTME3), mkDoc(DOC_TESTME4)];
        const res = evaluateQueryAST(ast, docs, { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { tags: (d) => (d as any).tags } });
        const ids = res.hits.map(h => h.id);
        expect(ids).toContain(docs[0].id);
        expect(ids).not.toContain(docs[1].id);
    });

    it('does not match file:"" for virtual title field (DOC_TESTME18)', () => {
        const ast = parseQuery('file:""');
        const docEmpty = mkDoc(DOC_TESTME18);
        const docFull = mkDoc(DOC_TESTME15);
        const opts = { ...TEST_OPTS, defaultFields: ['title'], fieldMap: { file: (d) => d.title } } satisfies EvaluateOptions;
        const res = evaluateQueryAST(ast, [docEmpty, docFull], opts);
        const ids = res.hits.map(h => h.id);
        expect(ids).not.toContain(docEmpty.id);
        expect(ids).not.toContain(docFull.id);
    });

    it('meta: matches notes with the field present (DOC_TESTME19, DOC_TESTME20)', () => {
        const docs = [mkDoc(DOC_TESTME19), mkDoc(DOC_TESTME20), mkDoc(DOC_TESTME1)];
        const res = evaluateQueryAST(parseQuery('meta:'), docs, TEST_OPTS);
        const ids = res.hits.map(h => h.id);
        expect(ids).toContain(docs[0].id);
        expect(ids).toContain(docs[1].id);
        expect(ids).not.toContain(docs[2].id);
    });

    it('meta:"" matches only empty values (DOC_TESTME20)', () => {
        const docs = [mkDoc(DOC_TESTME19), mkDoc(DOC_TESTME20)];
        const res = evaluateQueryAST(parseQuery('meta:""'), docs, TEST_OPTS);
        const ids = res.hits.map(h => h.id);
        expect(ids).toContain(docs[1].id);
        expect(ids).not.toContain(docs[0].id);
    });

    it('meta:any matches only non-empty values (DOC_TESTME19)', () => {
        const docs = [mkDoc(DOC_TESTME19), mkDoc(DOC_TESTME20)];
        const res = evaluateQueryAST(parseQuery('meta:any'), docs, TEST_OPTS);
        const ids = res.hits.map(h => h.id);
        expect(ids).toContain(docs[0].id);
        expect(ids).not.toContain(docs[1].id);
    });

});
