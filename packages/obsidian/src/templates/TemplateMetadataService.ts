import { FrontmatterService, TemplateParser, VARIABLE_INPUT_TYPES, VARIABLE_TYPES } from 'packages/core/src/index';
import type {
	NoteOutputDefinition,
	SpecialVariableCatalog,
	ValidationIssue,
	VariableDefinition,
	VariableInputType,
	VariableType,
} from 'packages/core/src/index';

/** In-memory representation of the template frontmatter fields owned by this plugin. */
export interface EditableTemplateMetadata {
	template: { id: string; name: string; description?: string; tags?: string[] };
	variables: Record<string, VariableDefinition>;
	output: NoteOutputDefinition;
}

/** Converts, validates, and persists the plugin-owned template metadata fields. */
export class TemplateMetadataService {
	private readonly frontmatter = new FrontmatterService();
	private readonly parser: TemplateParser;

	constructor(specialVariables: SpecialVariableCatalog) {
		this.parser = new TemplateParser(specialVariables);
	}

	createEditable(content: string): EditableTemplateMetadata {
		let metadata = this.frontmatter.parse(content).data;
		let identityFields = this.object(metadata.template);
		let templateIdentity: EditableTemplateMetadata['template'] = { id: '', name: '' };

		if (typeof identityFields.id === 'string') {
			templateIdentity.id = identityFields.id;
		}
		if (typeof identityFields.name === 'string') {
			templateIdentity.name = identityFields.name;
		}
		if (typeof identityFields.description === 'string') {
			templateIdentity.description = identityFields.description;
		}
		if (Array.isArray(identityFields.tags)) {
			templateIdentity.tags = identityFields.tags.filter((tag): tag is string => typeof tag === 'string');
		}

		let variableDefinitions = Object.fromEntries(
			Object.entries(this.object(metadata.variables)).map(([variableName, value]) => [variableName, this.normalizeVariable(value)]),
		);

		return {
			template: templateIdentity,
			variables: structuredClone(variableDefinitions),
			output: structuredClone(this.object(metadata.output)),
		};
	}

	merge(content: string, state: EditableTemplateMetadata): string {
		return this.frontmatter.mergeTemplate(content, {
			template: state.template,
			variables: state.variables,
			output: state.output,
		});
	}

	apply(frontmatter: Record<string, unknown>, state: EditableTemplateMetadata): void {
		frontmatter.template = structuredClone(state.template);
		frontmatter.variables = structuredClone(state.variables);
		frontmatter.output = structuredClone(state.output);
	}

	validate(
		sourcePath: string,
		content: string,
		state: EditableTemplateMetadata,
		otherIds: ReadonlyMap<string, string>,
	): ValidationIssue[] {
		let issues = this.parser.parse(sourcePath, this.merge(content, state)).issues;
		let duplicatePath = otherIds.get(state.template.id);

		if (duplicatePath)
			issues.push({ severity: 'error', path: 'template.id', message: `Template ID is already used by "${duplicatePath}".` });

		return issues;
	}

	private normalizeVariable(value: unknown): VariableDefinition {
		let fields = this.object(value);
		let commonFields: Pick<VariableDefinition, 'label' | 'description'> = {};
		if (typeof fields.label === 'string') {
			commonFields.label = fields.label;
		}
		if (typeof fields.description === 'string') {
			commonFields.description = fields.description;
		}

		let variableType: VariableType = 'input';
		if (VARIABLE_TYPES.includes(fields.type as VariableType)) {
			variableType = fields.type as VariableType;
		}
		if (variableType === 'special') {
			let source = typeof fields.source === 'string' ? fields.source : '';

			return { ...commonFields, type: variableType, source };
		}

		if (variableType === 'formula') {
			let formula = typeof fields.formula === 'string' ? fields.formula : '';

			return { ...commonFields, type: variableType, formula };
		}

		let inputType: VariableInputType = 'text';
		if (VARIABLE_INPUT_TYPES.includes(fields.inputType as VariableInputType)) {
			inputType = fields.inputType as VariableInputType;
		}

		let inputDefinition: Extract<VariableDefinition, { type: 'input' }> = {
			...commonFields,
			type: 'input',
			inputType,
		};
		if (typeof fields.required === 'boolean') {
			inputDefinition.required = fields.required;
		}

		if (fields.default !== undefined) {
			inputDefinition.default = structuredClone(fields.default);
		}

		if (Array.isArray(fields.options)) {
			inputDefinition.options = fields.options.filter((option): option is string => typeof option === 'string');
		}

		return inputDefinition;
	}

	private object(value: unknown): Record<string, unknown> {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
		return value as Record<string, unknown>;
	}
}
