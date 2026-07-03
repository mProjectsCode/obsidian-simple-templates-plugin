import { parse, parseDocument, stringify } from 'yaml';
import { FrontmatterEditError, TemplateParseError } from 'packages/core/src/domain/Errors';

export interface FrontmatterDocument {
	raw: string | null;
	data: Record<string, unknown>;
	body: string;
	hasFrontmatter: boolean;
}

interface LineBoundary {
	contentEnd: number;
	end: number;
}

/** Owns Markdown frontmatter parsing, serialization, and template metadata updates. */
export class FrontmatterService {
	parse(content: string): FrontmatterDocument {
		let opening = this.lineBoundary(content, 0);
		if (opening.end === opening.contentEnd || !this.isDelimiterLine(content, 0, opening))
			return { raw: null, data: {}, body: content, hasFrontmatter: false };

		let closingStart = opening.end;
		let closing: LineBoundary | null = null;
		while (closingStart < content.length) {
			let candidate = this.lineBoundary(content, closingStart);
			if (this.isDelimiterLine(content, closingStart, candidate)) {
				closing = candidate;
				break;
			}
			closingStart = candidate.end;
		}
		if (!closing) return { raw: null, data: {}, body: content, hasFrontmatter: false };

		let raw = content.slice(opening.end, closingStart);
		try {
			let parsed: unknown = parse(raw);
			return {
				raw,
				data: parsed === null ? {} : this.asObject(parsed),
				body: content.slice(closing.end),
				hasFrontmatter: true,
			};
		} catch (error) {
			throw new TemplateParseError(`Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	serialize(data: Record<string, unknown>): string {
		return stringify(data, { lineWidth: 0 }).trimEnd();
	}

	mergeTemplate(content: string, known: { template?: unknown; variables?: unknown; output?: unknown }): string {
		let document = this.parse(content);
		let yaml = document.hasFrontmatter && document.raw !== null ? this.mergeYamlDocument(document.raw, known) : this.serialize(known);
		if (document.hasFrontmatter) return `---\n${yaml}\n---\n${document.body}`;
		if (!yaml) throw new FrontmatterEditError('Cannot insert empty frontmatter.');
		return `---\n${yaml}\n---\n${content}`;
	}

	private mergeYamlDocument(raw: string, known: { template?: unknown; variables?: unknown; output?: unknown }): string {
		let document = parseDocument(raw);
		if (document.errors.length > 0) throw new FrontmatterEditError(`Cannot edit YAML frontmatter: ${document.errors[0]?.message}`);
		for (let key of ['template', 'variables', 'output'] as const) {
			if (known[key] === undefined) document.delete(key);
			else document.set(key, structuredClone(known[key]));
		}
		return document.toString({ lineWidth: 0 }).trimEnd();
	}

	parseYamlObject(yaml: string): Record<string, unknown> {
		try {
			let value: unknown = parse(yaml);
			return value === null ? {} : this.asObject(value);
		} catch (error) {
			throw new TemplateParseError(`Invalid rendered note frontmatter: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private lineBoundary(content: string, start: number): LineBoundary {
		let contentEnd = start;
		while (contentEnd < content.length && content[contentEnd] !== '\r' && content[contentEnd] !== '\n') contentEnd += 1;
		let end = contentEnd;
		if (content[end] === '\r') end += 1;
		if (content[end] === '\n') end += 1;
		return { contentEnd, end };
	}

	private isDelimiterLine(content: string, start: number, boundary: LineBoundary): boolean {
		if (content.slice(start, start + 3) !== '---') return false;
		for (let index = start + 3; index < boundary.contentEnd; index += 1)
			if (content[index] !== ' ' && content[index] !== '\t') return false;
		return true;
	}

	private asObject(value: unknown): Record<string, unknown> {
		if (value === null || typeof value !== 'object' || Array.isArray(value))
			throw new TemplateParseError('YAML frontmatter must contain a mapping.');
		return value as Record<string, unknown>;
	}
}
