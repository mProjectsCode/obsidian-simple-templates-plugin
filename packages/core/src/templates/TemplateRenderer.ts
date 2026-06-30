import type { RenderedTemplateAst, TemplateAst, TemplateNode, TemplateProgram } from 'packages/core/src/domain/TemplateAst';
import { TemplateValidationError } from 'packages/core/src/domain/Errors';
import type { ResolvedVariables } from 'packages/core/src/domain/Types';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';

/** Renders template programs and owns the parser used for raw template strings. */
export class TemplateRenderer {
	constructor(private readonly parser = new TemplateProgramParser()) {}

	renderProgram(program: TemplateProgram, values: ResolvedVariables, declared?: ReadonlySet<string>): string {
		let output: string[] = [];
		this.renderNodes(program.nodes, values, declared, output);
		return output.join('');
	}

	render(template: string | TemplateProgram, values: ResolvedVariables, declared?: ReadonlySet<string>): string {
		return this.renderProgram(typeof template === 'string' ? this.parser.parse(template) : template, values, declared);
	}

	renderAst(ast: TemplateAst, values: ResolvedVariables, declared?: ReadonlySet<string>): RenderedTemplateAst {
		return {
			body: this.renderProgram(ast.body, values, declared),
			...(ast.noteFrontmatter ? { noteFrontmatter: this.renderProgram(ast.noteFrontmatter, values, declared) } : {}),
			...(ast.filename ? { filename: this.renderProgram(ast.filename, values, declared) } : {}),
			...(ast.folder ? { folder: this.renderProgram(ast.folder, values, declared) } : {}),
		};
	}

	findReferences(...templates: (string | TemplateProgram | undefined)[]): Set<string> {
		let references = new Set<string>();
		for (let template of templates) {
			if (template === undefined) continue;
			let program = typeof template === 'string' ? this.parser.parse(template) : template;
			for (let reference of program.references) references.add(reference);
		}
		return references;
	}

	private renderNodes(
		nodes: readonly TemplateNode[],
		values: ResolvedVariables,
		declared: ReadonlySet<string> | undefined,
		output: string[],
	): void {
		for (let node of nodes) {
			if (node.type === 'text') {
				output.push(node.value);
				continue;
			}
			let root = node.parts[0] ?? '';
			if (declared && !declared.has(root)) throw new TemplateValidationError(`Variable "${root}" is not declared.`);
			let value = this.lookup(values, node.parts);
			if (node.type === 'if') {
				if (value) this.renderNodes(node.children, values, declared, output);
			} else output.push(this.renderValue(value));
		}
	}

	private lookup(values: ResolvedVariables, parts: readonly string[]): unknown {
		let cursor: unknown = values;
		for (let part of parts) {
			if (cursor === null || typeof cursor !== 'object') return undefined;
			cursor = (cursor as Record<string, unknown>)[part];
		}
		return cursor;
	}

	private renderValue(value: unknown): string {
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return value.map(item => this.renderValue(item)).join('\n');
		if (typeof value === 'object') return JSON.stringify(value);
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
		return '';
	}
}
