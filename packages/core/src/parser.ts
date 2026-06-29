import { parseFrontmatter } from 'packages/core/src/frontmatter';
import type { NoteOutputDefinition, ParseResult, TemplateDefinition, TemplateIdentity, VariableDefinition } from 'packages/core/src/types';
import { validateMetadataShape, validateTemplate } from 'packages/core/src/validation';

interface SourceLine {
	start: number;
	contentEnd: number;
	end: number;
	text: string;
}

function sourceLines(source: string): SourceLine[] {
	let lines: SourceLine[] = [];
	let pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
	for (let match of source.matchAll(pattern)) {
		let full = match[0];
		if (!full) continue;
		let newlineLength = full.endsWith('\r\n') ? 2 : full.endsWith('\r') || full.endsWith('\n') ? 1 : 0;
		let start = match.index;
		let contentEnd = start + full.length - newlineLength;
		lines.push({ start, contentEnd, end: start + full.length, text: source.slice(start, contentEnd) });
	}
	return lines;
}

function extractOutputFrontmatter(source: string): { body: string; blocks: string[] } {
	let lines = sourceLines(source);
	let blocks: string[] = [];
	let removals: { start: number; end: number }[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		let line = lines[index];
		if (!line) continue;
		let opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line.text);
		if (!opening) continue;
		let marker = opening[1] ?? '';
		let isOutputBlock = (opening[2] ?? '').trim() === 'note-frontmatter';
		let closingPattern = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[\\t ]*$`);
		let closingIndex = index + 1;
		while (closingIndex < lines.length && !closingPattern.test(lines[closingIndex]?.text ?? '')) closingIndex += 1;
		if (closingIndex >= lines.length) break;
		if (isOutputBlock) {
			let closing = lines[closingIndex];
			if (!closing) break;
			let content = source.slice(line.end, closing.start).replace(/\r?\n$/, '');
			blocks.push(content);
			removals.push({ start: line.start, end: closing.contentEnd });
		}
		index = closingIndex;
	}
	let body = source;
	for (let index = removals.length - 1; index >= 0; index -= 1) {
		let removal = removals[index];
		if (removal) body = body.slice(0, removal.start) + body.slice(removal.end);
	}
	return { body, blocks };
}

function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readIdentity(value: unknown): TemplateIdentity {
	let identity = object(value) ?? {};
	return {
		id: typeof identity.id === 'string' ? identity.id : '',
		name: typeof identity.name === 'string' ? identity.name : '',
		...(typeof identity.description === 'string' ? { description: identity.description } : {}),
		...(Array.isArray(identity.tags) && identity.tags.every(tag => typeof tag === 'string') ? { tags: identity.tags } : {}),
	};
}

export function parseTemplate(sourcePath: string, content: string): ParseResult {
	try {
		let document = parseFrontmatter(content);
		let identity = readIdentity(document.data.template);
		let variables = Object.fromEntries(
			Object.entries(object(document.data.variables) ?? {}).map(([name, value]) => [
				name,
				(object(value) ?? { type: '' }) as unknown as VariableDefinition,
			]),
		);
		let output = object(document.data.output) as NoteOutputDefinition | null;
		let { body, blocks } = extractOutputFrontmatter(document.body);
		let template: TemplateDefinition = {
			...identity,
			sourcePath,
			variables,
			...(output ? { output } : {}),
			body,
			...(blocks[0] !== undefined ? { outputFrontmatterTemplate: blocks[0] } : {}),
			rawFrontmatter: document.raw,
			parsedFrontmatter: document.data,
		};
		let issues = [...validateMetadataShape(document.data), ...validateTemplate(template)];
		if (blocks.length > 1) issues.push({ severity: 'error', message: 'A template may contain at most one note-frontmatter block.' });
		if (!document.hasFrontmatter) issues.unshift({ severity: 'error', message: 'Template metadata frontmatter is missing.' });
		return { template, issues };
	} catch (error) {
		return { template: null, issues: [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }] };
	}
}
