import type { ResolvedVariables } from 'packages/core/src/domain/Types';

/** Host-provided evaluator for template formula expressions. */
export abstract class ExpressionEvaluator {
	abstract evaluate(source: string, values: ResolvedVariables, sourcePath?: string): Promise<unknown>;
}
