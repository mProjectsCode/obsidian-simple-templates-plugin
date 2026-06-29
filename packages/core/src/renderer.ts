import { TemplateValidationError } from 'packages/core/src/errors';
import type { ResolvedVariables } from 'packages/core/src/types';

const TOKEN_PATTERN = /{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}/g;
const IF_PATTERN = /{{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}([\s\S]*?){{\/if}}/g;

function lookup(values: ResolvedVariables, path: string): unknown {
	let cursor: unknown = values;
	for (let part of path.split('.')) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}

function renderValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (Array.isArray(value)) return value.map(renderValue).join('\n');
	if (typeof value === 'object') return JSON.stringify(value);
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
	return '';
}

export function findVariableReferences(...templates: (string | undefined)[]): Set<string> {
	let references = new Set<string>();
	for (let template of templates) {
		if (!template) continue;
		for (let match of template.matchAll(TOKEN_PATTERN)) references.add((match[1] ?? '').split('.')[0] ?? '');
		for (let match of template.matchAll(IF_PATTERN)) references.add((match[1] ?? '').split('.')[0] ?? '');
	}
	references.delete('');
	return references;
}

export function renderTemplate(template: string, values: ResolvedVariables, declared?: Set<string>): string {
	let validatePath = (path: string): void => {
		let root = path.split('.')[0] ?? '';
		if (declared && !declared.has(root)) throw new TemplateValidationError(`Variable "${root}" is not declared.`);
	};
	let withConditionals = template.replace(IF_PATTERN, (_whole, path: string, body: string) => {
		validatePath(path);
		return lookup(values, path) ? body : '';
	});
	return withConditionals.replace(TOKEN_PATTERN, (_whole, path: string) => {
		validatePath(path);
		return renderValue(lookup(values, path));
	});
}
