import type { ResolvedVariables } from 'packages/core/src/domain/Types';

/** Host-provided evaluator for template formula expressions. */
export abstract class ExpressionEvaluator {
	/** Resolves bare identifiers locally and delegates every other expression to the host. */
	evaluateTemplateExpression(source: string, values: ResolvedVariables, sourcePath?: string): Promise<unknown> {
		if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(source) && Object.hasOwn(values, source)) return Promise.resolve(values[source]);
		return this.evaluate(source, values, sourcePath);
	}

	abstract evaluate(source: string, values: ResolvedVariables, sourcePath?: string): Promise<unknown>;
}
