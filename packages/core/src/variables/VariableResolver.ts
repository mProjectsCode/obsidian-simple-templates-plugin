import { FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/domain/Errors';
import type { ExecutionContext, ResolvedVariables, VariableDefinition } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';

/**
 * Resolves template variables through special sources, user input, Safe JS expressions,
 * defaults, type coercion, and required-value checks.
 */
export class VariableResolver {
	constructor(
		private readonly specialVariables: SpecialVariableRegistry<unknown>,
		private readonly expressions: ExpressionEvaluator,
	) {}

	static needingInput(definitions: Record<string, VariableDefinition>): string[] {
		return Object.entries(definitions)
			.filter(([, definition]) => definition.ask === true || (!definition.formula && !definition.source))
			.map(([name]) => name);
	}

	async resolve(
		definitions: Record<string, VariableDefinition>,
		context: ExecutionContext,
		userValues: ResolvedVariables,
		sourcePath?: string,
	): Promise<ResolvedVariables> {
		let values: ResolvedVariables = {};

		// ---- 1. Populate from special sources ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.source && definition.ask !== true) values[name] = this.specialVariables.resolve(definition.source, context);
		}

		// ---- 2. Apply user-provided values (override specials) ----
		for (let [name, value] of Object.entries(userValues)) {
			if (!(name in definitions)) throw new VariableResolutionError(`Unknown variable "${name}".`);
			values[name] = value;
		}

		// ---- 3. Variables with no source, no formula, and no user value are undefined ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (!definition.formula && !definition.source && !(name in values)) values[name] = undefined;
		}

		// ---- 4. Apply defaults so expressions can consume them ----
		for (let [name, definition] of Object.entries(definitions))
			if (values[name] === undefined && definition.default !== undefined) values[name] = structuredClone(definition.default);

		// ---- 5. Resolve Safe JS expressions in declaration order ----
		await this.resolveFormulas(definitions, userValues, values, sourcePath);

		// ---- 6. Coerce and check required ----
		for (let [name, definition] of Object.entries(definitions)) {
			values[name] = this.coerce(name, definition, values[name]);
			if (definition.required && (values[name] === undefined || values[name] === null || values[name] === '')) {
				throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
			}
		}

		return values;
	}

	private async resolveFormulas(
		definitions: Record<string, VariableDefinition>,
		userValues: ResolvedVariables,
		values: ResolvedVariables,
		sourcePath?: string,
	): Promise<void> {
		for (let [name, definition] of Object.entries(definitions)) {
			if (!definition.formula || (definition.ask === true && Object.hasOwn(userValues, name))) continue;
			try {
				values[name] = await this.expressions.evaluate(definition.formula, values, sourcePath);
			} catch (error) {
				throw new FormulaError(`Expression for "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private coerce(name: string, definition: VariableDefinition, value: unknown): unknown {
		if (value === undefined || value === null || value === '') return value;
		switch (definition.type) {
			case 'number': {
				let number = typeof value === 'number' ? value : Number(value);
				if (!Number.isFinite(number)) throw new VariableResolutionError(`Variable "${name}" must be a number.`);
				return number;
			}
			case 'boolean':
				if (typeof value === 'boolean') return value;
				if (value === 'true') return true;
				if (value === 'false') return false;
				throw new VariableResolutionError(`Variable "${name}" must be true or false.`);
			case 'multiselect':
			case 'list':
				return this.coerceList(name, definition, value);
			case 'select': {
				let selected = this.scalar(value, name);
				if (!definition.options?.includes(selected))
					throw new VariableResolutionError(`Variable "${name}" must be one of its configured options.`);
				return selected;
			}
			case 'date': {
				let date = this.scalar(value, name);
				if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
					throw new VariableResolutionError(`Variable "${name}" must be a date in YYYY-MM-DD format.`);
				return date;
			}
			case 'datetime': {
				let datetime = this.scalar(value, name);
				if (Number.isNaN(Date.parse(datetime)))
					throw new VariableResolutionError(`Variable "${name}" must be a valid date and time.`);
				return datetime;
			}
			default:
				return value;
		}
	}

	private coerceList(name: string, definition: VariableDefinition, value: unknown): unknown[] {
		let items = Array.isArray(value)
			? value
			: this.scalar(value, name)
					.split(/\r?\n|,/)
					.map(item => item.trim())
					.filter(Boolean);
		if (definition.type === 'multiselect' && items.some(item => !definition.options?.includes(this.scalar(item, name))))
			throw new VariableResolutionError(`Variable "${name}" contains a value outside its configured options.`);
		return items;
	}

	private scalar(value: unknown, name: string): string {
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
		throw new VariableResolutionError(`Variable "${name}" must be a scalar value.`);
	}
}
