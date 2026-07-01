import type { JsonValue, SafeJsCallerApi } from '@lemons_dev/obsidian-safe-js-api';
import { ExpressionEvaluator, FormulaError } from 'packages/core/src/index';
import type { ResolvedVariables } from 'packages/core/src/index';

/** Implements core expression evaluation using the Safe JS plugin sandbox. */
export class SafeJsExpressionEvaluator extends ExpressionEvaluator {
	constructor(private readonly api: Pick<SafeJsCallerApi, 'executeExpression'>) {
		super();
	}

	override async evaluate(source: string, values: ResolvedVariables, sourcePath?: string): Promise<JsonValue> {
		let result = await this.api.executeExpression(source, {
			inputs: this.toInputs(values),
			permissions: [],
			...(sourcePath ? { source: { path: sourcePath } } : {}),
		});

		if (result.status !== 'success') throw new FormulaError(`Safe JS expression failed: ${result.message}`);
		return result.value;
	}

	private toInputs(values: ResolvedVariables): Record<string, JsonValue> {
		return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, this.toJsonValue(name, value)]));
	}

	private toJsonValue(name: string, value: unknown): JsonValue {
		if (value === undefined) return null;
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (Array.isArray(value)) return value.map(item => this.toJsonValue(name, item));
		if (typeof value === 'object') {
			let prototype = Reflect.getPrototypeOf(value);
			if (prototype === Object.prototype || prototype === null)
				return Object.fromEntries(
					Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, this.toJsonValue(name, item)]),
				);
		}
		throw new FormulaError(`Variable "${name}" cannot be passed to Safe JS because it is not JSON-safe.`);
	}
}
