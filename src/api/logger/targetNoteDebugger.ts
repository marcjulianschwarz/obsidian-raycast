import { Doc, EvaluateOptions } from '../../utils/search/evaluator';
import { TermNode } from '../../utils/search/parser';
import { getFieldValues } from '../../utils/search/evaluator'; // if you want to reuse it
import { dbgEval, targetNoteDebugActive } from './debugger';

export function dumpTargetNoteDebug(
    targetNoteTitle: string,
    docs: Doc[],
    fields: string[],
    node: TermNode,
    opts: EvaluateOptions,
    matched: boolean
) {
    const isActive = targetNoteDebugActive;
    if (!isActive) return;

    const TARGET = targetNoteTitle;
    for (const d of docs) {
        if (String((d as any).id || "").includes(TARGET)) {
            const docAny = d as any;
            const ownKeys = Object.keys(docAny).sort();

            const valuesByQueryField = Object.fromEntries(
                fields.map((f) => [f, getFieldValues(d, f, opts)])
            );

            const valuesByDefaultField = Object.fromEntries(
                (opts.defaultFields || []).map((f) => [f, getFieldValues(d, f, opts)])
            );

            const fieldMapKeys = Object.keys(opts.fieldMap || {});
            const valuesByFieldMap = Object.fromEntries(
                fieldMapKeys.map((f) => [f, getFieldValues(d, f, opts)])
            );

            const testDocJson = JSON.stringify(d, null, 2);

            dbgEval('evalExactLeaf, TARGET DUMP', {
                targetId: d.id,
                query: { fields, raw: node.value, phrase: node.phrase, fuzzy: node.fuzzy, regex: node.regex?.pattern },
                matched,
                ownKeys,
                docSnapshot: d,
                valuesByQueryField,
                valuesByDefaultField,
                valuesByFieldMap,
                testDocSnippet: `const DOC: Doc = ${testDocJson} as const;`,
            });
        }
    }
}