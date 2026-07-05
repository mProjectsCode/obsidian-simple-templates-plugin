import type { NoteOutputDefinition, TemplateDefinition, ValidationIssue, VariableDefinition } from 'packages/core/src/domain/Types';
import type { TemplateProgram } from 'packages/core/src/domain/TemplateAst';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';
import { TemplateMetadataSchema, VariableDefinitionSchema } from 'packages/core/src/templates/TemplateSchemas';
import type { SpecialVariableCatalog } from 'packages/core/src/variables/SpecialVariableRegistry';
import type { z } from 'zod';
import { InputValueService } from 'packages/core/src/variables/InputValueService';

/** Validates raw metadata and compiled template definitions with shared dependencies. */
export class TemplateValidator {
	private readonly inputValues = new InputValueService();
	constructor(
		private readonly specialVariables: SpecialVariableCatalog,
		private readonly parser = new TemplateProgramParser(),
	) {}

	/** Validates a variable's Zod shape and host-dependent source. */
	private validateVariableDefinition(name: string, definition: unknown): ValidationIssue[] {
		let issues: ValidationIssue[] = [];

		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
			issues.push({ severity: 'error', path: `variables.${name}`, message: `Variable key "${name}" is invalid.` });

		let validationResult = VariableDefinitionSchema.safeParse(definition);
		if (!validationResult.success)
			return [...issues, ...validationResult.error.issues.flatMap(issue => this.variableZodIssue(name, definition, issue))];

		if (validationResult.data.type === 'special' && !this.specialVariables.has(validationResult.data.source))
			issues.push({
				severity: 'error',
				path: `variables.${name}.source`,
				message: `Special variable "${name}" requires a valid source.`,
			});

		if (validationResult.data.type === 'input' && validationResult.data.default !== undefined) {
			try {
				this.inputValues.coerce(name, validationResult.data, validationResult.data.default);
			} catch (error) {
				issues.push({
					severity: 'error',
					path: `variables.${name}.default`,
					message: `Default value is invalid: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

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

	/** Validates the shape of the raw frontmatter data. */
	private validateMetadataShape(data: Record<string, unknown>): ValidationIssue[] {
		let validationResult = TemplateMetadataSchema.safeParse(data);
		if (validationResult.success) return [];
		return validationResult.error.issues.flatMap(issue => this.metadataZodIssue(data, issue));
	}

	private variableZodIssue(name: string, definition: unknown, issue: z.core.$ZodIssue): ValidationIssue[] {
		let path = `variables.${name}${issue.path.length ? `.${issue.path.map(String).join('.')}` : ''}`;
		let fields: object | null = null;
		if (definition !== null && typeof definition === 'object' && !Array.isArray(definition)) fields = definition;

		let variableType = '';
		if (fields) variableType = String(Reflect.get(fields, 'type'));

		if (issue.code === 'unrecognized_keys')
			return issue.keys.map(field => ({
				severity: 'error',
				path: `variables.${name}.${field}`,
				message: `Variable "${name}" cannot define ${field} when its type is "${variableType}".`,
			}));

		let field = String(issue.path[0] ?? '');
		let message: string;
		if (!fields) message = `Variable "${name}" must be a mapping.`;
		else if (field === 'type') message = `Variable "${name}" has an invalid type.`;
		else if (field === 'inputType') message = `Input variable "${name}" has an invalid input type.`;
		else if (field === 'options' && issue.message === 'requires-options') message = `Variable "${name}" requires at least one option.`;
		else if (field === 'options' && issue.message === 'options-not-allowed')
			message = 'Only select and multiselect variables can define options.';
		else if (field === 'options') message = `Variable "${name}" options must be a list of strings.`;
		else if (field === 'source') message = `Special variable "${name}" requires a valid source.`;
		else if (field === 'formula' && issue.code === 'invalid_type') message = `Variable "${name}" formula must be a string.`;
		else if (field === 'formula') message = `Formula variable "${name}" requires an expression.`;
		else if (field === 'required') message = `Variable "${name}" required must be true or false.`;
		else if (field === 'label' || field === 'description') message = `Variable "${name}" ${field} must be a string.`;
		else message = issue.message;

		return [{ severity: 'error', path, message }];
	}

	private metadataZodIssue(data: Record<string, unknown>, issue: z.core.$ZodIssue): ValidationIssue[] {
		let issuePath = issue.path.map(String);
		let section = issuePath[0];
		let variableName = issuePath[1];

		if (section === 'variables' && variableName !== undefined) {
			let variables = data.variables;
			let definition: unknown;
			if (variables !== null && typeof variables === 'object') {
				definition = (variables as Record<string, unknown>)[variableName];
			}
			return this.variableZodIssue(variableName, definition, { ...issue, path: issue.path.slice(2) });
		}

		let path = issue.path.map(String).join('.');
		let message: string;
		if (path === 'template') message = 'Template metadata must be a mapping.';
		else if (path === 'template.id') message = 'Template ID must be a string.';
		else if (path === 'template.name') message = 'Template name must be a string.';
		else if (path === 'template.description') message = 'Template description must be a string.';
		else if (path.startsWith('template.tags')) message = 'Template tags must be a list of strings.';
		else if (path === 'variables') message = 'Variables must be a mapping.';
		else if (path === 'output') message = 'Output must be a mapping.';
		else if (path === 'output.filename') message = 'Output filename must be a string.';
		else if (path === 'output.conflict') message = 'Output conflict strategy must be a string.';
		else if (path === 'output.openAfterCreate') message = 'Open after create must be true or false.';
		else if (path === 'output.folder') message = 'Output folder must be an object with a mode.';
		else if (path === 'output.folder.mode') message = 'Output folder mode must be a string.';
		else if (path === 'output.folder.path') message = 'Output folder path must be a string.';
		else message = issue.message;

		return [{ severity: 'error', path: path || undefined, message }];
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

		// Simple variable paths can be checked statically. Safe JS expressions
		// are intentionally deferred to the sandbox evaluator.
		let filenameTemplate: string | TemplateProgram | undefined = template.ast?.filename;
		if (filenameTemplate === undefined && typeof template.output?.filename === 'string') {
			filenameTemplate = template.output.filename;
		}
		let folderTemplate: string | TemplateProgram | undefined;
		if (template.output?.folder?.mode === 'path' && typeof template.output.folder.path === 'string') {
			folderTemplate = template.ast?.folder ?? template.output.folder.path;
		}

		let references = this.findReferences(
			template.ast?.body ?? template.body,
			template.ast?.noteFrontmatter ?? template.outputFrontmatterTemplate,
			filenameTemplate,
			folderTemplate,
		);
		for (let reference of references)
			if (!(reference in template.variables))
				issues.push({
					severity: 'error',
					message: `Template "${template.name || template.sourcePath}" references variable "${reference}", but it is not declared.`,
				});

		return issues;
	}

	private findReferences(...templates: (string | TemplateProgram | undefined)[]): Set<string> {
		let references = new Set<string>();
		for (let template of templates) {
			if (template === undefined) continue;

			let program: TemplateProgram;
			if (typeof template === 'string') program = this.parser.parse(template);
			else program = template;

			for (let reference of program.references) references.add(reference);
		}

		return references;
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
