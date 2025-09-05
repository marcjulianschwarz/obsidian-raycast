import { parseQuery } from '../parse';
import { evaluateQueryAST, type EvaluateOptions } from '../evaluate';

const mkDoc = (overrides: any = {}) => ({
  text: '',
  fields: {},     // e.g., { test: 'ma "b' }
  ...overrides,
});

const TEST_OPTS = {
  defaultFields: ['title'],
} as const satisfies EvaluateOptions;

describe('evaluate', () => {
  it('matches fielded phrase with escaped quote', () => {
    const ast = parseQuery('test:"ma \\"b"');
    const doc = mkDoc({ fields: { test: 'ma "b' } });
    expect(evaluateQueryAST(ast, [doc], TEST_OPTS)).toBe(true);
  });

  it('matches colon-after-quote as literal term', () => {
    const ast = parseQuery('"term":test');
    const doc = mkDoc({ text: 'term :test' });
    expect(evaluateQueryAST(ast, [doc], TEST_OPTS)).toBe(true);
  });

  it('treats :note as literal', () => {
    const ast = parseQuery(':note');
    const doc = mkDoc({ text: 'prefix :note suffix' });
    expect(evaluateQueryAST(ast, [doc], TEST_OPTS)).toBe(true);
  });

  it('quotes precedence keeps phrases together', () => {
    const ast = parseQuery('abc "def"');
    const doc = mkDoc({ text: 'xx abc yy def zz' });
    expect(evaluateQueryAST(ast, [doc], TEST_OPTS)).toBe(true);
  });
});