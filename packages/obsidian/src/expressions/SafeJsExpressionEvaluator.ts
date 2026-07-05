import type { JsonValue, SafeJsCallerApi } from '@lemons_dev/obsidian-safe-js-api';
import { ExpressionEvaluator, FormulaError } from 'packages/core/src/index';
import type { ResolvedVariables } from 'packages/core/src/index';

/** Implements core expression evaluation using the Safe JS plugin sandbox. */
export class SafeJsExpressionEvaluator extends ExpressionEvaluator {
	private api: Pick<SafeJsCallerApi, 'executeExpression'> | null = null;

	constructor(private readonly getApi: () => Pick<SafeJsCallerApi, 'executeExpression'> | null) {
		super();
	}

	override async evaluate(source: string, values: ResolvedVariables, sourcePath?: string): Promise<JsonValue> {
		let api = this.api ?? this.getApi();
		if (!api) throw new FormulaError('Safe JS must be installed and enabled to evaluate this expression.');

		this.api = api;

		let executionOptions: Parameters<SafeJsCallerApi['executeExpression']>[1] = {
			inputs: this.toInputs(values),
			permissions: [],
		};
		if (sourcePath) executionOptions.source = { path: sourcePath };

		let result = await api.executeExpression(source, executionOptions);

		if (result.status !== 'success') throw new FormulaError(`Safe JS expression failed: ${result.message}`);
		return result.value;
	}

	private toInputs(values: ResolvedVariables): Record<string, JsonValue> {
		let inputs: Record<string, JsonValue> = {};
		for (let [name, value] of Object.entries(values)) {
			inputs[name] = this.toJsonValue(name, value);
		}

		return inputs;
	}

	private toJsonValue(name: string, value: unknown): JsonValue {
		if (value === undefined) return null;
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (Array.isArray(value)) return value.map(item => this.toJsonValue(name, item));
		if (typeof value === 'object') {
			let prototype = Reflect.getPrototypeOf(value);

			if (prototype === Object.prototype || prototype === null) {
				let objectValue: Record<string, JsonValue> = {};
				for (let [key, item] of Object.entries(value as Record<string, unknown>)) {
					objectValue[key] = this.toJsonValue(name, item);
				}

				return objectValue;
			}
		}

		throw new FormulaError(`Variable "${name}" cannot be passed to Safe JS because it is not JSON-safe.`);
	}
}
