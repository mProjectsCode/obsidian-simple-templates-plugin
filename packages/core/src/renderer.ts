import { TemplateValidationError } from 'packages/core/src/errors';
import type { ResolvedVariables } from 'packages/core/src/types';

/** Matches `{{ variableName }}` tokens (may include dot-separated paths). */
const TOKEN_PATTERN = /{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}/g;

/** Matches `{{#if variableName}}...{{/if}}` conditional blocks. */
const IF_PATTERN = /{{#if\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}([\s\S]*?){{\/if}}/g;

/** Resolves a dot-separated path (e.g. `"a.b.c"`) against a nested object. */
function lookup(values: ResolvedVariables, path: string): unknown {
	let cursor: unknown = values;
	for (let part of path.split('.')) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}

/** Converts an arbitrary value to its string representation. */
function renderValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (Array.isArray(value)) return value.map(renderValue).join('\n');
	if (typeof value === 'object') return JSON.stringify(value);
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
	return '';
}

/**
 * Scans one or more template strings and returns the set of root variable
 * names referenced (via either `{{var}}` or `{{#if var}}` syntax).
 */
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

/**
 * Renders a template string by:
 *  1. Evaluating `{{#if var}}...{{/if}}` conditionals.
 *  2. Substituting `{{var}}` / `{{var.subpath}}` tokens with resolved values.
 *
 * When a `declared` set is provided, references to undeclared variables throw.
 */
export function renderTemplate(template: string, values: ResolvedVariables, declared?: Set<string>): string {
	let validatePath = (path: string): void => {
		let root = path.split('.')[0] ?? '';
		if (declared && !declared.has(root)) throw new TemplateValidationError(`Variable "${root}" is not declared.`);
	};

	// Step 1: evaluate conditionals
	let withConditionals = template.replace(IF_PATTERN, (_whole, path: string, body: string) => {
		validatePath(path);
		return lookup(values, path) ? body : '';
	});

	// Step 2: substitute simple value tokens
	return withConditionals.replace(TOKEN_PATTERN, (_whole, path: string) => {
		validatePath(path);
		return renderValue(lookup(values, path));
	});
}
