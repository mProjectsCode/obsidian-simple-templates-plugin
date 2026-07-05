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
		let data = this.frontmatter.parse(content).data;
		let identity = this.object(data.template);
		let variables = Object.fromEntries(
			Object.entries(this.object(data.variables)).map(([name, value]) => [name, this.normalizeVariable(value)]),
		);
		return {
			template: {
				id: typeof identity.id === 'string' ? identity.id : '',
				name: typeof identity.name === 'string' ? identity.name : '',
				...(typeof identity.description === 'string' ? { description: identity.description } : {}),
				...(Array.isArray(identity.tags) ? { tags: identity.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
			},
			variables: structuredClone(variables),
			output: structuredClone(this.object(data.output)),
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
		let definition = this.object(value);
		let common = {
			...(typeof definition.label === 'string' ? { label: definition.label } : {}),
			...(typeof definition.description === 'string' ? { description: definition.description } : {}),
		};
		let type = VARIABLE_TYPES.includes(definition.type as VariableType) ? (definition.type as VariableType) : 'input';
		if (type === 'special') return { ...common, type, source: typeof definition.source === 'string' ? definition.source : '' };
		if (type === 'formula') return { ...common, type, formula: typeof definition.formula === 'string' ? definition.formula : '' };
		let inputType = VARIABLE_INPUT_TYPES.includes(definition.inputType as VariableInputType)
			? (definition.inputType as VariableInputType)
			: 'text';
		return {
			...common,
			type,
			inputType,
			...(typeof definition.required === 'boolean' ? { required: definition.required } : {}),
			...(definition.default !== undefined ? { default: structuredClone(definition.default) } : {}),
			...(Array.isArray(definition.options)
				? { options: definition.options.filter((option): option is string => typeof option === 'string') }
				: {}),
		};
	}

	private object(value: unknown): Record<string, unknown> {
		return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	}
}
