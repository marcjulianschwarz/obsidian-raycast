import { validateQuerySyntax } from '../validator';

describe('validate (structural only)', () => {
    it('balanced parentheses', () => {
        expect(validateQuerySyntax('(a AND b)')).toEqual({ ok: true });
        expect(validateQuerySyntax('(a AND b')).toMatchObject({ ok: false, issue: { code: 'UNBALANCED_PARENS' } });
    });

    it('AND/OR placement', () => {
        expect(validateQuerySyntax('a AND b')).toEqual({ ok: true });
        expect(validateQuerySyntax('AND b')).toMatchObject({ ok: false, issue: { code: 'DANGLING_OPERATOR' } });
        expect(validateQuerySyntax('a OR')).toMatchObject({ ok: false, issue: { code: 'DANGLING_OPERATOR' } });
        expect(validateQuerySyntax('OR')).toMatchObject({ ok: false, issue: { code: 'DANGLING_OPERATOR' } });
    });

    it('unfinished regex', () => {
        expect(validateQuerySyntax('/re.*/i')).toEqual({ ok: true });
        expect(validateQuerySyntax('/re.*')).toMatchObject({ ok: false, issue: { code: 'UNFINISHED_REGEX' } });
    });

    it('quotes do not error (validator is lenient)', () => {
        expect(validateQuerySyntax('"abc" AND def')).toEqual({ ok: true });
        expect(validateQuerySyntax('"abc')).toEqual({ ok: true }); // validator doesn’t enforce quotes
    });
});