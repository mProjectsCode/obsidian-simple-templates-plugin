import { FrontmatterService, TemplateParser, VARIABLE_TYPES } from 'packages/core/src/index';
import type {
	NoteOutputDefinition,
	SpecialVariableRegistry,
	ValidationIssue,
	VariableDefinition,
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

/** Parses the current file content into an editable metadata state. */
export function createEditableTemplateMetadata(content: string): EditableTemplateMetadata {
	let data = FRONTMATTER.parse(content).data;
	let identity = object(data.template);
	let variables = Object.fromEntries(
		Object.entries(object(data.variables)).map(([name, value]) => {
			let definition = object(value);
			return [
				name,
				{
					...definition,
					type: VARIABLE_TYPES.includes(definition.type as VariableType) ? definition.type : 'text',
				} as VariableDefinition,
			];
		}),
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
	specialVariables: SpecialVariableRegistry<unknown>,
): ValidationIssue[] {
	let merged = mergeEditableTemplateMetadata(content, state);

	// Run the standard parse/validation pipeline, downgrading
	// "references variable" errors to warnings (they are expected during
	// editing when variables have not been declared yet).
	let issues = new TemplateParser(specialVariables)
		.parse(sourcePath, merged)
		.issues.map(issue => (issue.message.includes('references variable') ? { ...issue, severity: 'warning' as const } : issue));

	// Check for duplicate template IDs across files
	let duplicatePath = otherIds.get(state.template.id);
	if (duplicatePath)
		issues.push({ severity: 'error', path: 'template.id', message: `Template ID is already used by "${duplicatePath}".` });

	return issues;
}
