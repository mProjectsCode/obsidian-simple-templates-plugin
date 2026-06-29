import { parse, stringify } from 'yaml';
import { FrontmatterEditError, TemplateParseError } from 'packages/core/src/errors';

export interface FrontmatterDocument {
	raw: string | null;
	data: Record<string, unknown>;
	body: string;
	hasFrontmatter: boolean;
}

const FRONTMATTER_PATTERN = /^---[\t ]*\r?\n([\s\S]*?)^---[\t ]*(?:\r?\n|$)/m;

function asObject(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TemplateParseError('YAML frontmatter must contain a mapping.');
	}
	return value as Record<string, unknown>;
}

export function parseFrontmatter(content: string): FrontmatterDocument {
	let match = FRONTMATTER_PATTERN.exec(content);
	if (!match) return { raw: null, data: {}, body: content, hasFrontmatter: false };
	let raw = match[1] ?? '';
	try {
		let parsed: unknown = parse(raw);
		return { raw, data: parsed === null ? {} : asObject(parsed), body: content.slice(match[0].length), hasFrontmatter: true };
	} catch (error) {
		throw new TemplateParseError(`Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export function serializeFrontmatter(data: Record<string, unknown>): string {
	return stringify(data, { lineWidth: 0 }).trimEnd();
}

export function mergeTemplateFrontmatter(content: string, known: { template?: unknown; variables?: unknown; output?: unknown }): string {
	let document = parseFrontmatter(content);
	let merged = structuredClone(document.data);
	for (let key of ['template', 'variables', 'output'] as const) {
		if (known[key] === undefined) delete merged[key];
		else merged[key] = structuredClone(known[key]);
	}
	let yaml = serializeFrontmatter(merged);
	if (document.hasFrontmatter) return `---\n${yaml}\n---\n${document.body}`;
	if (!yaml) throw new FrontmatterEditError('Cannot insert empty frontmatter.');
	return `---\n${yaml}\n---\n${content}`;
}

export function parseYamlObject(yaml: string): Record<string, unknown> {
	try {
		let value: unknown = parse(yaml);
		if (value === null) return {};
		return asObject(value);
	} catch (error) {
		throw new TemplateParseError(`Invalid rendered note frontmatter: ${error instanceof Error ? error.message : String(error)}`);
	}
}
