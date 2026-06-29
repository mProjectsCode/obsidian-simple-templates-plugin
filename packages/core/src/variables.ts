import { FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/errors';
import { evaluateFormula, getFormulaDependencies } from 'packages/core/src/formulas';
import type { FormulaRuntime } from 'packages/core/src/formulas';
import type { SpecialVariableRegistry } from 'packages/core/src/specialVariables';
import type { ExecutionContext, ResolvedVariables, VariableDefinition } from 'packages/core/src/types';

/** Returns the names of variables that will need user input (no formula, no
 *  source, or explicitly marked with `ask: true`). */
export function variablesNeedingInput(definitions: Record<string, VariableDefinition>): string[] {
	return Object.entries(definitions)
		.filter(([, definition]) => definition.ask === true || (!definition.formula && !definition.source))
		.map(([name]) => name);
}

/**
 * Coerces a raw variable value to the type declared in its definition.
 * This is the last step before a value is handed to the template renderer.
 */
function coerce(name: string, definition: VariableDefinition, value: unknown): unknown {
	if (value === undefined || value === null || value === '') return value;

	switch (definition.type) {
		case 'number':
			return coerceNumber(name, value);
		case 'boolean':
			return coerceBoolean(name, value);
		case 'multiselect':
		case 'list':
			return coerceList(name, definition, value);
		case 'select':
			return coerceSelect(name, definition, value);
		case 'date':
			return coerceDate(name, value);
		case 'datetime':
			return coerceDatetime(name, value);
		default:
			return value;
	}
}

function coerceNumber(name: string, value: unknown): number {
	let number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) throw new VariableResolutionError(`Variable "${name}" must be a number.`);
	return number;
}

function coerceBoolean(name: string, value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new VariableResolutionError(`Variable "${name}" must be true or false.`);
}

function coerceList(name: string, definition: VariableDefinition, value: unknown): unknown[] {
	let items = Array.isArray(value)
		? value
		: scalar(value, name)
				.split(/\r?\n|,/)
				.map(item => item.trim())
				.filter(Boolean);

	if (definition.type === 'multiselect' && items.some(item => !definition.options?.includes(scalar(item, name)))) {
		throw new VariableResolutionError(`Variable "${name}" contains a value outside its configured options.`);
	}
	return items;
}

function coerceSelect(name: string, definition: VariableDefinition, value: unknown): string {
	let selected = scalar(value, name);
	if (!definition.options?.includes(selected))
		throw new VariableResolutionError(`Variable "${name}" must be one of its configured options.`);
	return selected;
}

function coerceDate(name: string, value: unknown): string {
	let date = scalar(value, name);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new VariableResolutionError(`Variable "${name}" must be a date in YYYY-MM-DD format.`);
	return date;
}

function coerceDatetime(name: string, value: unknown): string {
	let datetime = scalar(value, name);
	if (Number.isNaN(Date.parse(datetime))) throw new VariableResolutionError(`Variable "${name}" must be a valid date and time.`);
	return datetime;
}

/** Guards that a value is scalar (string, number, boolean, bigint) and returns
 *  its string representation. */
function scalar(value: unknown, name: string): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
	throw new VariableResolutionError(`Variable "${name}" must be a scalar value.`);
}

/**
 * Evaluates formula-based variables in dependency order.  Formulas may
 * reference other formula-based variables, so we solve the dependency graph
 * iteratively until all formulas have been resolved.
 */
function resolveFormulas(
	definitions: Record<string, VariableDefinition>,
	userValues: ResolvedVariables,
	values: ResolvedVariables,
	runtime?: FormulaRuntime,
): void {
	let pending = new Set(
		Object.entries(definitions)
			.filter(([name, definition]) => definition.formula && !(definition.ask === true && Object.hasOwn(userValues, name)))
			.map(([name]) => name),
	);

	// Iteratively resolve formulas whose dependencies are all available
	while (pending.size > 0) {
		let progressed = false;

		for (let name of [...pending]) {
			let formula = definitions[name]?.formula;
			if (!formula) continue;

			let dependencies = getFormulaDependencies(formula);
			let unknown = dependencies.find(dependency => !(dependency in definitions));
			if (unknown) throw new FormulaError(`Formula for "${name}" references undeclared variable "${unknown}".`);

			if (dependencies.every(dependency => dependency in values)) {
				values[name] = evaluateFormula(formula, values, runtime);
				pending.delete(name);
				progressed = true;
			}
		}

		if (!progressed) throw new FormulaError(`Circular or unresolved formula dependencies: ${[...pending].join(', ')}.`);
	}
}

/**
 * Resolves every variable for a template.
 *
 * Resolution order:
 *  1. Host-registered special sources.
 *  2. User-provided values (overrides specials).
 *  3. Formulas (evaluated in dependency order).
 *  4. Defaults are applied for any missing values.
 *  5. Every value is coerced to its declared type.
 *  6. Required-variable checks are enforced.
 */
export function resolveVariables(
	definitions: Record<string, VariableDefinition>,
	specialVariables: SpecialVariableRegistry<unknown>,
	context: ExecutionContext,
	userValues: ResolvedVariables,
	runtime?: FormulaRuntime,
): ResolvedVariables {
	let values: ResolvedVariables = {};

	// ---- 1. Populate from special sources ----
	for (let [name, definition] of Object.entries(definitions)) {
		if (definition.source && definition.ask !== true) values[name] = specialVariables.resolve(definition.source, context, runtime);
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
	resolveFormulas(definitions, userValues, values, runtime);

	// ---- 5. Apply defaults, coerce, and check required ----
	for (let [name, definition] of Object.entries(definitions)) {
		if (values[name] === undefined && definition.default !== undefined) values[name] = structuredClone(definition.default);
		values[name] = coerce(name, definition, values[name]);
		if (definition.required && (values[name] === undefined || values[name] === null || values[name] === '')) {
			throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
		}
	}

	return values;
}
