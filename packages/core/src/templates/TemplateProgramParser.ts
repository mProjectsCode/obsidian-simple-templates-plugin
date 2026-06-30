import type { IfNode, TemplateNode, TemplateProgram } from 'packages/core/src/domain/TemplateAst';
import { TemplateParseError } from 'packages/core/src/domain/Errors';

interface IfFrame {
	node: IfNode;
	children: TemplateNode[];
}

/** Compiles source strings into reusable template programs. */
export class TemplateProgramParser {
	parse(source: string): TemplateProgram {
		let root: TemplateNode[] = [];
		let target = root;
		let frames: IfFrame[] = [];
		let references = new Set<string>();
		let cursor = 0;
		while (cursor < source.length) {
			let opening = source.indexOf('{{', cursor);
			if (opening < 0) {
				if (cursor < source.length) target.push({ type: 'text', value: source.slice(cursor), start: cursor, end: source.length });
				break;
			}
			if (opening > cursor) target.push({ type: 'text', value: source.slice(cursor, opening), start: cursor, end: opening });
			let closing = source.indexOf('}}', opening + 2);
			if (closing < 0) throw new TemplateParseError(`Unclosed template expression at offset ${opening}.`);
			let expression = this.trim(source.slice(opening + 2, closing));
			let end = closing + 2;
			if (expression === '/if') {
				let frame = frames.pop();
				if (!frame) throw new TemplateParseError(`Unexpected {{/if}} at offset ${opening}.`);
				frame.node.end = end;
				target = frames.at(-1)?.children ?? root;
			} else {
				let isIf = expression.startsWith('#if') && this.isWhitespace(expression[3] ?? '');
				let parsed = this.parsePath(isIf ? this.trim(expression.slice(3)) : expression, opening);
				references.add(parsed.parts[0] ?? '');
				if (isIf) {
					let children: TemplateNode[] = [];
					let node: IfNode = { type: 'if', ...parsed, children, start: opening, end };
					target.push(node);
					frames.push({ node, children });
					target = children;
				} else target.push({ type: 'variable', ...parsed, start: opening, end });
			}
			cursor = end;
		}
		let unclosed = frames.at(-1);
		if (unclosed) throw new TemplateParseError(`Unclosed {{#if ${unclosed.node.path}}} block at offset ${unclosed.node.start}.`);
		references.delete('');
		return { type: 'program', nodes: root, references: [...references] };
	}

	private parsePath(value: string, offset: number): { path: string; parts: string[] } {
		if (!value || !this.isIdentifierStart(value[0] ?? '')) throw new TemplateParseError(`Invalid variable path at offset ${offset}.`);
		let parts: string[] = [];
		let partStart = 0;
		for (let index = 1; index <= value.length; index += 1) {
			let character = value[index];
			if (character === '.' || character === undefined) {
				parts.push(value.slice(partStart, index));
				partStart = index + 1;
				if (character === '.' && !this.isIdentifierStart(value[index + 1] ?? ''))
					throw new TemplateParseError(`Invalid variable path "${value}" at offset ${offset}.`);
			} else if (!this.isIdentifierPart(character))
				throw new TemplateParseError(`Invalid variable path "${value}" at offset ${offset}.`);
		}
		return { path: value, parts };
	}

	private trim(value: string): string {
		let start = 0;
		let end = value.length;
		while (start < end && this.isWhitespace(value[start] ?? '')) start += 1;
		while (end > start && this.isWhitespace(value[end - 1] ?? '')) end -= 1;
		return value.slice(start, end);
	}

	private isWhitespace(character: string): boolean {
		return character === ' ' || character === '\t' || character === '\r' || character === '\n';
	}

	private isIdentifierStart(character: string): boolean {
		let code = character.charCodeAt(0);
		return character === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
	}

	private isIdentifierPart(character: string): boolean {
		let code = character.charCodeAt(0);
		return this.isIdentifierStart(character) || (code >= 48 && code <= 57);
	}
}
