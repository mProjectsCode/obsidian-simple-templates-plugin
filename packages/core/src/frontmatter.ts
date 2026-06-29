import { parse, stringify } from 'yaml';
import { FrontmatterEditError, TemplateParseError } from 'packages/core/src/errors';

/** Result of parsing the frontmatter section of a Markdown file. */
export interface FrontmatterDocument {
	raw: string | null;
	data: Record<string, unknown>;
	body: string;
	hasFrontmatter: boolean;
}

/** Recognises YAML frontmatter delimited by `---` lines. */
const FRONTMATTER_PATTERN = /^---[\t ]*\r?\n([\s\S]*?)^---[\t ]*(?:\r?\n|$)/m;

/** Guards that `value` is a plain mapping (not null / array). */
function asObject(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TemplateParseError('YAML frontmatter must contain a mapping.');
	}
	return value as Record<string, unknown>;
}

/**
 * Parses the YAML frontmatter (if any) from a Markdown string.
 * When no frontmatter is present the body is the entire content.
 */
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

/** Serialises a metadata object back to a YAML string (no line-width limit). */
export function serializeFrontmatter(data: Record<string, unknown>): string {
	return stringify(data, { lineWidth: 0 }).trimEnd();
}

/**
 * Merges template-known properties (`template`, `variables`, `output`) back
 * into existing frontmatter content, preserving any extra keys the user may
 * have added manually.  If the file had no frontmatter a new one is created.
 */
export function mergeTemplateFrontmatter(content: string, known: { template?: unknown; variables?: unknown; output?: unknown }): string {
	let document = parseFrontmatter(content);
	let merged = structuredClone(document.data);

	// Replace only the three keys the editor manages; leave everything else untouched
	for (let key of ['template', 'variables', 'output'] as const) {
		if (known[key] === undefined) delete merged[key];
		else merged[key] = structuredClone(known[key]);
	}

	let yaml = serializeFrontmatter(merged);

	if (document.hasFrontmatter) return `---\n${yaml}\n---\n${document.body}`;
	if (!yaml) throw new FrontmatterEditError('Cannot insert empty frontmatter.');
	return `---\n${yaml}\n---\n${content}`;
}

/**
 * Parses a YAML string that was rendered from a template's
 * `note-frontmatter` block – validates it is a valid mapping.
 */
export function parseYamlObject(yaml: string): Record<string, unknown> {
	try {
		let value: unknown = parse(yaml);
		if (value === null) return {};
		return asObject(value);
	} catch (error) {
		throw new TemplateParseError(`Invalid rendered note frontmatter: ${error instanceof Error ? error.message : String(error)}`);
	}
}
