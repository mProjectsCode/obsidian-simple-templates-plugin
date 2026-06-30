import { FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/domain/Errors';
import type { ExecutionContext, ResolvedVariables, VariableDefinition } from 'packages/core/src/domain/Types';
import { FormulaEvaluator } from 'packages/core/src/formulas/FormulaEvaluator';
import type { FormulaRuntime } from 'packages/core/src/formulas/FormulaEvaluator';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';

/**
 * Resolves template variables through special sources, user input, formulas,
 * defaults, type coercion, and required-value checks.
 */
export class VariableResolver {
	private readonly formulas: FormulaEvaluator;

	constructor(
		private readonly specialVariables: SpecialVariableRegistry<unknown>,
		private readonly runtime?: FormulaRuntime,
		formulas?: FormulaEvaluator,
	) {
		this.formulas = formulas ?? new FormulaEvaluator(runtime);
	}

	static needingInput(definitions: Record<string, VariableDefinition>): string[] {
		return Object.entries(definitions)
			.filter(([, definition]) => definition.ask === true || (!definition.formula && !definition.source))
			.map(([name]) => name);
	}

	resolve(definitions: Record<string, VariableDefinition>, context: ExecutionContext, userValues: ResolvedVariables): ResolvedVariables {
		let values: ResolvedVariables = {};

		// ---- 1. Populate from special sources ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.source && definition.ask !== true)
				values[name] = this.specialVariables.resolve(definition.source, context, this.runtime);
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

		// ---- 4. Resolve formula-based variables ----
		this.resolveFormulas(definitions, userValues, values);

		// ---- 5. Apply defaults, coerce, and check required ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (values[name] === undefined && definition.default !== undefined) values[name] = structuredClone(definition.default);
			values[name] = this.coerce(name, definition, values[name]);
			if (definition.required && (values[name] === undefined || values[name] === null || values[name] === '')) {
				throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
			}
		}

		return values;
	}

	private resolveFormulas(
		definitions: Record<string, VariableDefinition>,
		userValues: ResolvedVariables,
		values: ResolvedVariables,
	): void {
		let pending = new Set(
			Object.entries(definitions)
				.filter(([name, definition]) => definition.formula && !(definition.ask === true && Object.hasOwn(userValues, name)))
				.map(([name]) => name),
		);
		while (pending.size > 0) {
			let progressed = false;
			for (let name of [...pending]) {
				let formula = definitions[name]?.formula;
				if (!formula) continue;
				let dependencies = this.formulas.dependencies(formula);
				let unknown = dependencies.find(dependency => !(dependency in definitions));
				if (unknown) throw new FormulaError(`Formula for "${name}" references undeclared variable "${unknown}".`);
				if (dependencies.every(dependency => dependency in values)) {
					values[name] = this.formulas.evaluate(formula, values);
					pending.delete(name);
					progressed = true;
				}
			}
			if (!progressed) throw new FormulaError(`Circular or unresolved formula dependencies: ${[...pending].join(', ')}.`);
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
