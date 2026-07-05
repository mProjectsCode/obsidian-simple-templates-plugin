import { parse, parseDocument, stringify } from 'yaml';
import { errorMessage, FrontmatterEditError, TemplateParseError } from 'packages/core/src/domain/Errors';
import { asRecord } from 'packages/core/src/domain/UnknownValue';
import { readSourceLine } from 'packages/core/src/domain/SourceText';
import type { SourceLine } from 'packages/core/src/domain/SourceText';

export interface FrontmatterDocument {
	raw: string | null;
	data: Record<string, unknown>;
	body: string;
	hasFrontmatter: boolean;
}

export interface TemplateFrontmatterFields {
	template?: unknown;
	variables?: unknown;
	output?: unknown;
}

const TEMPLATE_FRONTMATTER_KEYS = ['template', 'variables', 'output'] as const;

/** Owns Markdown frontmatter parsing, serialization, and template metadata updates. */
export class FrontmatterService {
	parse(content: string): FrontmatterDocument {
		let opening = readSourceLine(content, 0);
		if (opening.end === opening.contentEnd || !this.isDelimiterLine(content, 0, opening))
			return { raw: null, data: {}, body: content, hasFrontmatter: false };

		let closingStart = opening.end;
		let closing: SourceLine | null = null;
		while (closingStart < content.length) {
			let candidate = readSourceLine(content, closingStart);
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
			throw new TemplateParseError(`Invalid YAML frontmatter: ${errorMessage(error)}`);
		}
	}

	serialize(data: Record<string, unknown>): string {
		return stringify(data, { lineWidth: 0 }).trimEnd();
	}

	mergeTemplate(content: string, known: TemplateFrontmatterFields): string {
		let document = this.parse(content);
		let yaml: string;
		if (document.hasFrontmatter && document.raw !== null) {
			yaml = this.mergeYamlDocument(document.raw, known);
		} else {
			let frontmatter: Record<string, unknown> = {};
			this.applyTemplateFields(frontmatter, known);
			yaml = this.serialize(frontmatter);
		}
		if (document.hasFrontmatter) return `---\n${yaml}\n---\n${document.body}`;
		if (!yaml) throw new FrontmatterEditError('Cannot insert empty frontmatter.');
		return `---\n${yaml}\n---\n${content}`;
	}

	applyTemplateFields(frontmatter: Record<string, unknown>, known: TemplateFrontmatterFields): void {
		for (let key of TEMPLATE_FRONTMATTER_KEYS) {
			if (known[key] === undefined) delete frontmatter[key];
			else frontmatter[key] = structuredClone(known[key]);
		}
	}

	private mergeYamlDocument(raw: string, known: TemplateFrontmatterFields): string {
		let document = parseDocument(raw);
		if (document.errors.length > 0) throw new FrontmatterEditError(`Cannot edit YAML frontmatter: ${document.errors[0]?.message}`);
		for (let key of TEMPLATE_FRONTMATTER_KEYS) {
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
			throw new TemplateParseError(`Invalid rendered note frontmatter: ${errorMessage(error)}`);
		}
	}

	private isDelimiterLine(content: string, start: number, boundary: SourceLine): boolean {
		if (content.slice(start, start + 3) !== '---') return false;
		for (let index = start + 3; index < boundary.contentEnd; index += 1)
			if (content[index] !== ' ' && content[index] !== '\t') return false;
		return true;
	}

	private asObject(value: unknown): Record<string, unknown> {
		let record = asRecord(value);
		if (!record) throw new TemplateParseError('YAML frontmatter must contain a mapping.');

		return record;
	}
}
