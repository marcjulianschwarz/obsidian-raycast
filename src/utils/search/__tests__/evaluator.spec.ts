import { parseQuery } from '../parser';
import { evaluateQueryAST, type EvaluateOptions } from '../evaluator';
// at top of evaluate.spec.ts (or wherever your fixtures live)
import { type Doc } from '../evaluator';

export const DOC_BASE: Doc = {
    id: '/Users/exampleuser/JD/85-89_Test-Area-2/85_Test/85.10_Test/testme7.md',
    index: '[[85.10_Test]]',
    created: new Date('2025-09-04T22:37:26.956Z'),
    modified: new Date('2025-09-04T22:41:28.544Z'),
    test: 'ma "b',
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
const variant = (n: number, overrides: Partial<Doc> = {}): Doc => ({
    ...DOC_BASE,
    id: DOC_BASE.id.replace(/testme\d+\.md$/, `testme${n}.md`),
    title: `testme${n}`,
    ...overrides,
});

export const DOC_TESTME1 = variant(1); // base as-is
export const DOC_TESTME2 = variant(2, { test: 'hello"world' });
export const DOC_TESTME3 = variant(3, { tags: ['custom'] });
export const DOC_TESTME4 = variant(4, { tags: [] });
export const DOC_TESTME5 = variant(5, { title: 'reABC' }); // for regex test
export const DOC_TESTME6 = variant(6, { key: 'abc def' } as any); // fielded quoted value
export const DOC_TESTME7 = variant(7, { content: ':test' }); // literal ':'
export const DOC_TESTME8 = variant(8, { bookmarked: true });

const mkDoc = (base: Doc, overrides: Partial<Doc> = {}): Doc => ({
    ...base,
    ...overrides,
});

const TEST_OPTS = {
    defaultFields: ['title'],
} as const satisfies EvaluateOptions;

describe('evaluate', () => {
    it('matches fielded phrase with escaped quote (DOC_TESTME1)', () => {
        const ast = parseQuery('test:"ma \\"b"');
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

    it('matches a document with empty tags (DOC_TESTME4)', () => {
        const ast = parseQuery('tags:""');
        const doc = mkDoc(DOC_TESTME4);
        const res = evaluateQueryAST(ast, [doc], TEST_OPTS);
        expect(res.hits.map(h => h.id)).toContain(doc.id);
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
});