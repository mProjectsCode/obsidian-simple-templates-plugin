import { FrontmatterService, TemplateParser, VARIABLE_INPUT_TYPES, VARIABLE_TYPES } from 'packages/core/src/index';
import type {
	NoteOutputDefinition,
	SpecialVariableCatalog,
	ValidationIssue,
	VariableDefinition,
	VariableInputType,
	VariableType,
} from 'packages/core/src/index';

const FRONTMATTER = new FrontmatterService();

/** In-memory representation of a template's editable frontmatter fields. */
export interface EditableTemplateMetadata {
	template: { id: string; name: string; description?: string; tags?: string[] };
	variables: Record<string, VariableDefinition>;
	output: NoteOutputDefinition;
}

/** Guards that `value` is a plain object. */
function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeVariableDefinition(value: unknown): VariableDefinition {
	let definition = object(value);
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

/** Parses the current file content into an editable metadata state. */
export function createEditableTemplateMetadata(content: string): EditableTemplateMetadata {
	let data = FRONTMATTER.parse(content).data;
	let identity = object(data.template);
	let variables = Object.fromEntries(
		Object.entries(object(data.variables)).map(([name, value]) => [name, normalizeVariableDefinition(value)]),
	);
	return {
		template: {
			id: typeof identity.id === 'string' ? identity.id : '',
			name: typeof identity.name === 'string' ? identity.name : '',
			...(typeof identity.description === 'string' ? { description: identity.description } : {}),
			...(Array.isArray(identity.tags) ? { tags: identity.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
		},
		variables: structuredClone(variables),
		output: structuredClone(object(data.output)),
	};
}

/** Merges the in-memory state back into the original file content, replacing
 *  only the `template`, `variables`, and `output` top-level keys. */
export function mergeEditableTemplateMetadata(content: string, state: EditableTemplateMetadata): string {
	return FRONTMATTER.mergeTemplate(content, { template: state.template, variables: state.variables, output: state.output });
}

/** Validates the merged content and checks for duplicate template IDs. */
export function validateEditableTemplateMetadata(
	sourcePath: string,
	content: string,
	state: EditableTemplateMetadata,
	otherIds: ReadonlyMap<string, string>,
	specialVariables: SpecialVariableCatalog,
): ValidationIssue[] {
	let merged = mergeEditableTemplateMetadata(content, state);

	let issues = new TemplateParser(specialVariables).parse(sourcePath, merged).issues;

	// Check for duplicate template IDs across files
	let duplicatePath = otherIds.get(state.template.id);
	if (duplicatePath)
		issues.push({ severity: 'error', path: 'template.id', message: `Template ID is already used by "${duplicatePath}".` });

	return issues;
}
