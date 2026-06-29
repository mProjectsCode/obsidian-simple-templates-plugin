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

/** ---------- Variable validation ---------- */

/** Validates a single variable definition's fields. */
function validateVariableDefinition(name: string, definition: VariableDefinition): ValidationIssue[] {
	let issues: ValidationIssue[] = [];

	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
		issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable key "${name}" is invalid.` });

	if (!VARIABLE_TYPE_SET.has(definition.type))
		issues.push({ severity: 'error', path: `variables.${name}.type`, message: `Variable "${name}" has an invalid type.` });

	if (
		(definition.type === 'select' || definition.type === 'multiselect') &&
		(!Array.isArray(definition.options) || definition.options.length === 0)
	) {
		issues.push({ severity: 'error', path: `variables.${name}.options`, message: `Variable "${name}" requires at least one option.` });
	}

	if (definition.type === 'special' && (!definition.source || !SPECIAL_SOURCE_SET.has(definition.source))) {
		issues.push({
			severity: 'error',
			path: `variables.${name}.source`,
			message: `Special variable "${name}" requires a valid source.`,
		});
	}

	if (definition.formula && definition.source)
		issues.push({
			severity: 'error',
			path: `variables.${name}`,
			message: `Variable "${name}" cannot have both a formula and a source.`,
		});

	return issues;
}

/**
 * Builds a dependency map from formula variables, producing issues for
 * undeclared references and detecting circular dependencies.
 */
function validateFormulaDependencies(variables: Record<string, VariableDefinition>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];

	// Build a map: formula variable name → list of other formula variables it depends on
	let dependencyMap = new Map<string, string[]>();
	for (let [name, definition] of Object.entries(variables)) {
		if (!definition.formula) continue;
		try {
			let formulaDependencies = getFormulaDependencies(definition.formula);
			dependencyMap.set(
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
			issues.push({
				severity: 'error',
				path: `variables.${name}.formula`,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// Detect cycles using a standard DFS approach
	detectCycles(dependencyMap, issues);

	return issues;
}

/** Detects circular dependencies in the formula graph and adds an error issue
 *  for the first cycle found. */
function detectCycles(dependencyMap: Map<string, string[]>, issues: ValidationIssue[]): void {
	let visiting = new Set<string>();
	let visited = new Set<string>();

	let hasCycle = (name: string): boolean => {
		if (visiting.has(name)) return true;
		if (visited.has(name)) return false;
		visiting.add(name);
		let found = (dependencyMap.get(name) ?? []).some(hasCycle);
		visiting.delete(name);
		visited.add(name);
		return found;
	};

	for (let name of dependencyMap.keys())
		if (hasCycle(name)) {
			issues.push({
				severity: 'error',
				path: `variables.${name}.formula`,
				message: `Formula for "${name}" has a circular dependency.`,
			});
			break;
		}
}

/** Validates every variable definition and their formula dependency graph. */
export function validateVariables(variables: Record<string, VariableDefinition>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];

	for (let [name, definition] of Object.entries(variables)) {
		issues.push(...validateVariableDefinition(name, definition));
	}

	issues.push(...validateFormulaDependencies(variables));

	return issues;
}

/** ---------- Metadata shape validation ---------- */

/** Guards that `value` is a plain object (used for frontmatter field access). */
function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Validates the frontmatter `template` identity fields. */
function validateIdentityFields(identity: Record<string, unknown>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	if (identity.id !== undefined && typeof identity.id !== 'string')
		issues.push({ severity: 'error', path: 'template.id', message: 'Template ID must be a string.' });
	if (identity.name !== undefined && typeof identity.name !== 'string')
		issues.push({ severity: 'error', path: 'template.name', message: 'Template name must be a string.' });
	if (identity.description !== undefined && typeof identity.description !== 'string')
		issues.push({ severity: 'error', path: 'template.description', message: 'Template description must be a string.' });
	if (identity.tags !== undefined && (!Array.isArray(identity.tags) || identity.tags.some(tag => typeof tag !== 'string')))
		issues.push({ severity: 'error', path: 'template.tags', message: 'Template tags must be a list of strings.' });
	return issues;
}

/** Validates a single variable entry in the frontmatter `variables` map. */
function validateVariableEntry(name: string, value: unknown): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	let definition = record(value);
	if (!definition) {
		issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable "${name}" must be a mapping.` });
		return issues;
	}
	for (let field of ['label', 'description', 'formula', 'source'] as const)
		if (definition[field] !== undefined && typeof definition[field] !== 'string')
			issues.push({
				severity: 'error',
				path: `variables.${name}.${field}`,
				message: `Variable "${name}" ${field} must be a string.`,
			});
	for (let field of ['required', 'ask'] as const)
		if (definition[field] !== undefined && typeof definition[field] !== 'boolean')
			issues.push({
				severity: 'error',
				path: `variables.${name}.${field}`,
				message: `Variable "${name}" ${field} must be true or false.`,
			});
	if (
		definition.options !== undefined &&
		(!Array.isArray(definition.options) || definition.options.some(option => typeof option !== 'string'))
	)
		issues.push({
			severity: 'error',
			path: `variables.${name}.options`,
			message: `Variable "${name}" options must be a list of strings.`,
		});
	return issues;
}

/** Validates the `output` frontmatter field. */
function validateOutputEntry(output: Record<string, unknown>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];
	if (output.filename !== undefined && typeof output.filename !== 'string')
		issues.push({ severity: 'error', path: 'output.filename', message: 'Output filename must be a string.' });
	if (output.conflict !== undefined && typeof output.conflict !== 'string')
		issues.push({ severity: 'error', path: 'output.conflict', message: 'Output conflict strategy must be a string.' });
	if (output.openAfterCreate !== undefined && typeof output.openAfterCreate !== 'boolean')
		issues.push({ severity: 'error', path: 'output.openAfterCreate', message: 'Open after create must be true or false.' });
	if (output.folder !== undefined && !record(output.folder))
		issues.push({ severity: 'error', path: 'output.folder', message: 'Output folder must be an object with a mode.' });
	return issues;
}

/** Validates the shape of the raw frontmatter data. */
export function validateMetadataShape(data: Record<string, unknown>): ValidationIssue[] {
	let issues: ValidationIssue[] = [];

	// --- template identity ---
	let identity = record(data.template);
	if (!identity) return [{ severity: 'error', path: 'template', message: 'Template metadata must be a mapping.' }];
	issues.push(...validateIdentityFields(identity));

	// --- variables map ---
	if (data.variables !== undefined) {
		let variables = record(data.variables);
		if (!variables) {
			issues.push({ severity: 'error', path: 'variables', message: 'Variables must be a mapping.' });
		} else {
			for (let [name, value] of Object.entries(variables)) {
				issues.push(...validateVariableEntry(name, value));
			}
		}
	}

	// --- output ---
	if (data.output !== undefined) {
		let output = record(data.output);
		if (!output) {
			issues.push({ severity: 'error', path: 'output', message: 'Output must be a mapping.' });
		} else {
			issues.push(...validateOutputEntry(output));
		}
	}

	return issues;
}

/** ---------- Output validation ---------- */

/** Validates the `NoteOutputDefinition` sub-fields. */
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

/** ---------- Template-level validation ---------- */

/** Validates a fully parsed template definition. */
export function validateTemplate(template: TemplateDefinition): ValidationIssue[] {
	let issues: ValidationIssue[] = [];

	// ID and name are mandatory
	if (!template.id) issues.push({ severity: 'error', path: 'template.id', message: 'Template ID is required.' });
	else if (!/^[a-zA-Z0-9_-]+$/.test(template.id))
		issues.push({ severity: 'error', path: 'template.id', message: `Template ID "${template.id}" is invalid.` });
	if (!template.name) issues.push({ severity: 'error', path: 'template.name', message: 'Template name is required.' });

	// Delegate to sub-validators
	issues.push(...validateVariables(template.variables), ...validateOutput(template.output));

	// Check that every `{{var}}` / `{{#if var}}` reference in the template
	// body matches a declared variable.
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
