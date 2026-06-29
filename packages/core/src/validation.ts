import { findVariableReferences } from 'packages/core/src/renderer';
import { getFormulaDependencies } from 'packages/core/src/formulas';
import type {
	NoteOutputDefinition,
	SpecialVariableSource,
	TemplateDefinition,
	ValidationIssue,
	VariableDefinition,
	VariableType,
} from 'packages/core/src/types';
import { SPECIAL_VARIABLE_SOURCES, VARIABLE_TYPES } from 'packages/core/src/types';

const VARIABLE_TYPE_SET = new Set<VariableType>(VARIABLE_TYPES);
const SPECIAL_SOURCE_SET = new Set<SpecialVariableSource>(SPECIAL_VARIABLE_SOURCES);

export function validateVariables(variables: Record<string, VariableDefinition>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	for (let [name, definition] of Object.entries(variables)) {
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
			issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable key "${name}" is invalid.` });
		if (!VARIABLE_TYPE_SET.has(definition.type))
			issues.push({ severity: 'error', path: `variables.${name}.type`, message: `Variable "${name}" has an invalid type.` });
		if ((definition.type === 'select' || definition.type === 'multiselect') && (!Array.isArray(definition.options) || definition.options.length === 0)) {
			issues.push({ severity: 'error', path: `variables.${name}.options`, message: `Variable "${name}" requires at least one option.` });
		}
		if (definition.type === 'special' && (!definition.source || !SPECIAL_SOURCE_SET.has(definition.source))) {
			issues.push({ severity: 'error', path: `variables.${name}.source`, message: `Special variable "${name}" requires a valid source.` });
		}
		if (definition.formula && definition.source)
			issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable "${name}" cannot have both a formula and a source.` });
	}
	let dependencies = new Map<string, string[]>();
	for (let [name, definition] of Object.entries(variables)) {
		if (!definition.formula) continue;
		try {
			let formulaDependencies = getFormulaDependencies(definition.formula);
			dependencies.set(
				name,
				formulaDependencies.filter(dependency => variables[dependency]?.formula),
			);
			for (let dependency of formulaDependencies)
				if (!(dependency in variables))
					issues.push({
						severity: 'error',
						path: `variables.${name}.formula`,
						message: `Formula for "${name}" references undeclared variable "${dependency}".`,
					});
		} catch (error) {
			issues.push({ severity: 'error', path: `variables.${name}.formula`, message: error instanceof Error ? error.message : String(error) });
		}
	}
	let visiting = new Set<string>();
	let visited = new Set<string>();
	let visit = (name: string): boolean => {
		if (visiting.has(name)) return true;
		if (visited.has(name)) return false;
		visiting.add(name);
		let circular = (dependencies.get(name) ?? []).some(visit);
		visiting.delete(name);
		visited.add(name);
		return circular;
	};
	for (let name of dependencies.keys())
		if (visit(name)) {
			issues.push({ severity: 'error', path: `variables.${name}.formula`, message: `Formula for "${name}" has a circular dependency.` });
			break;
		}
	return issues;
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function validateMetadataShape(data: Record<string, unknown>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	let identity = record(data.template);
	if (!identity) return [{ severity: 'error', path: 'template', message: 'Template metadata must be a mapping.' }];
	if (identity.id !== undefined && typeof identity.id !== 'string')
		issues.push({ severity: 'error', path: 'template.id', message: 'Template ID must be a string.' });
	if (identity.name !== undefined && typeof identity.name !== 'string')
		issues.push({ severity: 'error', path: 'template.name', message: 'Template name must be a string.' });
	if (identity.description !== undefined && typeof identity.description !== 'string')
		issues.push({ severity: 'error', path: 'template.description', message: 'Template description must be a string.' });
	if (identity.tags !== undefined && (!Array.isArray(identity.tags) || identity.tags.some(tag => typeof tag !== 'string')))
		issues.push({ severity: 'error', path: 'template.tags', message: 'Template tags must be a list of strings.' });
	if (data.variables !== undefined) {
		let variables = record(data.variables);
		if (!variables) issues.push({ severity: 'error', path: 'variables', message: 'Variables must be a mapping.' });
		else
			for (let [name, value] of Object.entries(variables)) {
				let definition = record(value);
				if (!definition) {
					issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable "${name}" must be a mapping.` });
					continue;
				}
				for (let field of ['label', 'description', 'formula', 'source'] as const)
					if (definition[field] !== undefined && typeof definition[field] !== 'string')
						issues.push({ severity: 'error', path: `variables.${name}.${field}`, message: `Variable "${name}" ${field} must be a string.` });
				for (let field of ['required', 'ask'] as const)
					if (definition[field] !== undefined && typeof definition[field] !== 'boolean')
						issues.push({ severity: 'error', path: `variables.${name}.${field}`, message: `Variable "${name}" ${field} must be true or false.` });
				if (definition.options !== undefined && (!Array.isArray(definition.options) || definition.options.some(option => typeof option !== 'string')))
					issues.push({ severity: 'error', path: `variables.${name}.options`, message: `Variable "${name}" options must be a list of strings.` });
			}
	}
	if (data.output !== undefined) {
		let output = record(data.output);
		if (!output) issues.push({ severity: 'error', path: 'output', message: 'Output must be a mapping.' });
		else {
			if (output.filename !== undefined && typeof output.filename !== 'string')
				issues.push({ severity: 'error', path: 'output.filename', message: 'Output filename must be a string.' });
			if (output.conflict !== undefined && typeof output.conflict !== 'string')
				issues.push({ severity: 'error', path: 'output.conflict', message: 'Output conflict strategy must be a string.' });
			if (output.openAfterCreate !== undefined && typeof output.openAfterCreate !== 'boolean')
				issues.push({ severity: 'error', path: 'output.openAfterCreate', message: 'Open after create must be true or false.' });
			if (output.folder !== undefined && !record(output.folder))
				issues.push({ severity: 'error', path: 'output.folder', message: 'Output folder must be an object with a mode.' });
		}
	}
	return issues;
}

export function validateOutput(output: NoteOutputDefinition | undefined): ValidationIssue[] {
	if (!output) return [];
	let issues: ValidationIssue[] = [];
	if (output.folder) {
		if (!['default', 'same-as-active-file', 'path'].includes(output.folder.mode))
			issues.push({ severity: 'error', path: 'output.folder.mode', message: 'Output folder mode is invalid.' });
		if (output.folder.mode === 'path' && typeof output.folder.path !== 'string')
			issues.push({ severity: 'error', path: 'output.folder.path', message: 'Explicit output folder requires a path.' });
	}
	if (output.conflict && !['prompt', 'append-number', 'cancel'].includes(output.conflict))
		issues.push({ severity: 'error', path: 'output.conflict', message: 'Output conflict strategy is invalid.' });
	return issues;
}

export function validateTemplate(template: TemplateDefinition): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	if (!template.id) issues.push({ severity: 'error', path: 'template.id', message: 'Template ID is required.' });
	else if (!/^[a-zA-Z0-9_-]+$/.test(template.id))
		issues.push({ severity: 'error', path: 'template.id', message: `Template ID "${template.id}" is invalid.` });
	if (!template.name) issues.push({ severity: 'error', path: 'template.name', message: 'Template name is required.' });
	issues.push(...validateVariables(template.variables), ...validateOutput(template.output));
	let references = findVariableReferences(
		template.body,
		template.outputFrontmatterTemplate,
		template.output?.filename,
		template.output?.folder?.mode === 'path' ? template.output.folder.path : undefined,
	);
	for (let reference of references)
		if (!(reference in template.variables))
			issues.push({
				severity: 'error',
				message: `Template "${template.name || template.sourcePath}" references variable "${reference}", but it is not declared.`,
			});
	return issues;
}
