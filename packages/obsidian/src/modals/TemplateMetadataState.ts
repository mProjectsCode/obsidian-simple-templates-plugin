import { mergeTemplateFrontmatter, parseFrontmatter, parseTemplate, VARIABLE_TYPES } from 'packages/core/src/index';
import type { NoteOutputDefinition, ValidationIssue, VariableDefinition, VariableType } from 'packages/core/src/index';

export interface EditableTemplateMetadata {
	template: { id: string; name: string; description?: string; tags?: string[] };
	variables: Record<string, VariableDefinition>;
	output: NoteOutputDefinition;
}

function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function createEditableTemplateMetadata(content: string): EditableTemplateMetadata {
	let data = parseFrontmatter(content).data;
	let identity = object(data.template);
	let variables = Object.fromEntries(
		Object.entries(object(data.variables)).map(([name, value]) => {
			let definition = object(value);
			return [name, { ...definition, type: VARIABLE_TYPES.includes(definition.type as VariableType) ? definition.type : 'text' } as VariableDefinition];
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

export function mergeEditableTemplateMetadata(content: string, state: EditableTemplateMetadata): string {
	return mergeTemplateFrontmatter(content, { template: state.template, variables: state.variables, output: state.output });
}

export function validateEditableTemplateMetadata(
	sourcePath: string,
	content: string,
	state: EditableTemplateMetadata,
	otherIds: ReadonlyMap<string, string>,
): ValidationIssue[] {
	let merged = mergeEditableTemplateMetadata(content, state);
	let issues = parseTemplate(sourcePath, merged).issues.map(issue =>
		issue.message.includes('references variable') ? { ...issue, severity: 'warning' as const } : issue,
	);
	let duplicatePath = otherIds.get(state.template.id);
	if (duplicatePath) issues.push({ severity: 'error', path: 'template.id', message: `Template ID is already used by "${duplicatePath}".` });
	return issues;
}
