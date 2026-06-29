import { FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/errors';
import { evaluateFormula, formatLocalDate, getFormulaDependencies } from 'packages/core/src/formulas';
import type { FormulaRuntime } from 'packages/core/src/formulas';
import type { ExecutionContext, ResolvedVariables, SpecialVariableSource, VariableDefinition } from 'packages/core/src/types';

export function getSpecialValue(source: SpecialVariableSource, context: ExecutionContext, runtime?: FormulaRuntime): unknown {
	switch (source) {
		case 'activeFile.path':
			return context.activeFilePath;
		case 'activeFile.basename':
			return context.activeFileBasename;
		case 'activeFile.folder':
			return context.activeFileFolder;
		case 'activeFile.frontmatter':
			return context.activeFileFrontmatter;
		case 'activeFile.content':
			return context.activeFileContent ?? null;
		case 'cursor.line':
			return context.cursor?.line ?? null;
		case 'cursor.ch':
			return context.cursor?.ch ?? null;
		case 'editor.selection':
			return context.editorSelection ?? null;
		case 'clipboard':
			return context.clipboard ?? null;
		case 'date.today':
			return formatLocalDate(runtime?.now() ?? new Date());
		case 'date.now':
			return (runtime?.now() ?? new Date()).toISOString();
	}
}

export function variablesNeedingInput(definitions: Record<string, VariableDefinition>): string[] {
	return Object.entries(definitions)
		.filter(([, definition]) => definition.ask === true || (!definition.formula && !definition.source))
		.map(([name]) => name);
}

function scalar(value: unknown, name: string): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
	throw new VariableResolutionError(`Variable "${name}" must be a scalar value.`);
}

function coerce(name: string, definition: VariableDefinition, value: unknown): unknown {
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
		case 'list': {
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
		case 'select':
			if (!definition.options?.includes(scalar(value, name)))
				throw new VariableResolutionError(`Variable "${name}" must be one of its configured options.`);
			return scalar(value, name);
		case 'date':
			if (!/^\d{4}-\d{2}-\d{2}$/.test(scalar(value, name))) throw new VariableResolutionError(`Variable "${name}" must be a date in YYYY-MM-DD format.`);
			return scalar(value, name);
		case 'datetime':
			if (Number.isNaN(Date.parse(scalar(value, name)))) throw new VariableResolutionError(`Variable "${name}" must be a valid date and time.`);
			return scalar(value, name);
		default:
			return value;
	}
}

export function resolveVariables(
	definitions: Record<string, VariableDefinition>,
	context: ExecutionContext,
	userValues: ResolvedVariables,
	runtime?: FormulaRuntime,
): ResolvedVariables {
	let values: ResolvedVariables = {};
	for (let [name, definition] of Object.entries(definitions)) {
		if (definition.source && definition.ask !== true) values[name] = getSpecialValue(definition.source, context, runtime);
	}
	for (let [name, value] of Object.entries(userValues)) {
		if (!(name in definitions)) throw new VariableResolutionError(`Unknown variable "${name}".`);
		values[name] = value;
	}
	for (let [name, definition] of Object.entries(definitions)) {
		if (!definition.formula && !definition.source && !(name in values)) values[name] = undefined;
	}

	let pending = new Set(
		Object.entries(definitions)
			.filter(([, definition]) => definition.formula)
			.map(([name]) => name),
	);
	for (let [name, definition] of Object.entries(definitions)) if (definition.formula && definition.ask === true && name in userValues) pending.delete(name);
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

	for (let [name, definition] of Object.entries(definitions)) {
		if (values[name] === undefined && definition.default !== undefined) values[name] = structuredClone(definition.default);
		values[name] = coerce(name, definition, values[name]);
		if (definition.required && (values[name] === undefined || values[name] === null || values[name] === '')) {
			throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
		}
	}
	return values;
}
