import type {
	NoteOutputDefinition,
	TemplateDefinition,
	ValidationIssue,
	VariableDefinition,
	VariableType,
} from 'packages/core/src/domain/Types';
import { VARIABLE_TYPES } from 'packages/core/src/domain/Types';
import { TemplateRenderer } from 'packages/core/src/templates/TemplateRenderer';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';

const VARIABLE_TYPE_SET = new Set<VariableType>(VARIABLE_TYPES);

/** Validates raw metadata and compiled template definitions with shared dependencies. */
export class TemplateValidator {
	constructor(
		private readonly specialVariables: SpecialVariableRegistry<unknown>,
		private readonly renderer = new TemplateRenderer(),
	) {}

	/** Validates a single variable definition's fields. */
	private validateVariableDefinition(name: string, definition: VariableDefinition): ValidationIssue[] {
		let issues: ValidationIssue[] = [];

		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
			issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable key "${name}" is invalid.` });

		if (!VARIABLE_TYPE_SET.has(definition.type))
			issues.push({ severity: 'error', path: `variables.${name}.type`, message: `Variable "${name}" has an invalid type.` });

		if (
			(definition.type === 'select' || definition.type === 'multiselect') &&
			(!Array.isArray(definition.options) || definition.options.length === 0)
		) {
			issues.push({
				severity: 'error',
				path: `variables.${name}.options`,
				message: `Variable "${name}" requires at least one option.`,
			});
		}

		if (definition.type === 'special' && (!definition.source || !this.specialVariables.has(definition.source))) {
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

	/** Validates every variable definition. Expressions are validated by Safe JS when executed. */
	private validateVariableDefinitions(variables: Record<string, VariableDefinition>): ValidationIssue[] {
		let issues: ValidationIssue[] = [];

		for (let [name, definition] of Object.entries(variables)) {
			issues.push(...this.validateVariableDefinition(name, definition));
		}

		return issues;
	}

	/** Guards that `value` is a plain object (used for frontmatter field access). */
	private record(value: unknown): Record<string, unknown> | null {
		return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
	}

	/** Validates the frontmatter `template` identity fields. */
	private validateIdentityFields(identity: Record<string, unknown>): ValidationIssue[] {
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
	private validateVariableEntry(name: string, value: unknown): ValidationIssue[] {
		let issues: ValidationIssue[] = [];
		let definition = this.record(value);
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
	private validateOutputEntry(output: Record<string, unknown>): ValidationIssue[] {
		let issues: ValidationIssue[] = [];
		if (output.filename !== undefined && typeof output.filename !== 'string')
			issues.push({ severity: 'error', path: 'output.filename', message: 'Output filename must be a string.' });
		if (output.conflict !== undefined && typeof output.conflict !== 'string')
			issues.push({ severity: 'error', path: 'output.conflict', message: 'Output conflict strategy must be a string.' });
		if (output.openAfterCreate !== undefined && typeof output.openAfterCreate !== 'boolean')
			issues.push({ severity: 'error', path: 'output.openAfterCreate', message: 'Open after create must be true or false.' });
		if (output.folder !== undefined && !this.record(output.folder))
			issues.push({ severity: 'error', path: 'output.folder', message: 'Output folder must be an object with a mode.' });
		return issues;
	}

	/** Validates the shape of the raw frontmatter data. */
	private validateMetadataShape(data: Record<string, unknown>): ValidationIssue[] {
		let issues: ValidationIssue[] = [];

		let identity = this.record(data.template);
		if (!identity) return [{ severity: 'error', path: 'template', message: 'Template metadata must be a mapping.' }];
		issues.push(...this.validateIdentityFields(identity));

		if (data.variables !== undefined) {
			let variables = this.record(data.variables);
			if (!variables) {
				issues.push({ severity: 'error', path: 'variables', message: 'Variables must be a mapping.' });
			} else {
				for (let [name, value] of Object.entries(variables)) {
					issues.push(...this.validateVariableEntry(name, value));
				}
			}
		}

		if (data.output !== undefined) {
			let output = this.record(data.output);
			if (!output) {
				issues.push({ severity: 'error', path: 'output', message: 'Output must be a mapping.' });
			} else {
				issues.push(...this.validateOutputEntry(output));
			}
		}

		return issues;
	}

	/** Validates the `NoteOutputDefinition` sub-fields. */
	private validateOutput(output: NoteOutputDefinition | undefined): ValidationIssue[] {
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

	/** Validates a fully parsed template definition. */
	private validateTemplateDefinition(template: TemplateDefinition): ValidationIssue[] {
		let issues: ValidationIssue[] = [];

		// ID and name are mandatory
		if (!template.id) issues.push({ severity: 'error', path: 'template.id', message: 'Template ID is required.' });
		else if (!/^[a-zA-Z0-9_-]+$/.test(template.id))
			issues.push({ severity: 'error', path: 'template.id', message: `Template ID "${template.id}" is invalid.` });
		if (!template.name) issues.push({ severity: 'error', path: 'template.name', message: 'Template name is required.' });

		// Delegate to sub-validators
		issues.push(...this.validateVariableDefinitions(template.variables), ...this.validateOutput(template.output));

		// Check that every `{{var}}` / `{{#if var}}` reference in the template
		// body matches a declared variable.
		let references = this.renderer.findReferences(
			template.ast?.body ?? template.body,
			template.ast?.noteFrontmatter ?? template.outputFrontmatterTemplate,
			template.ast?.filename ?? (typeof template.output?.filename === 'string' ? template.output.filename : undefined),
			template.output?.folder?.mode === 'path' && typeof template.output.folder.path === 'string'
				? (template.ast?.folder ?? template.output.folder.path)
				: undefined,
		);
		for (let reference of references)
			if (!(reference in template.variables))
				issues.push({
					severity: 'error',
					message: `Template "${template.name || template.sourcePath}" references variable "${reference}", but it is not declared.`,
				});

		return issues;
	}

	validateMetadata(data: Record<string, unknown>): ValidationIssue[] {
		return this.validateMetadataShape(data);
	}

	validateVariables(variables: Record<string, VariableDefinition>): ValidationIssue[] {
		return this.validateVariableDefinitions(variables);
	}

	validate(template: TemplateDefinition): ValidationIssue[] {
		return this.validateTemplateDefinition(template);
	}
}
