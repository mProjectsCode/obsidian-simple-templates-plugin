import type { RenderedTemplateAst, TemplateAst, TemplateNode, TemplateProgram } from 'packages/core/src/domain/TemplateAst';
import type { ResolvedVariables } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';

/** Evaluates and renders compiled template programs. */
export class TemplateRenderer {
	constructor(
		private readonly expressions: ExpressionEvaluator,
		private readonly parser = new TemplateProgramParser(),
	) {}

	async renderProgram(program: TemplateProgram, values: ResolvedVariables, sourcePath?: string): Promise<string> {
		let output: string[] = [];
		await this.renderNodes(program.nodes, values, sourcePath, output);
		return output.join('');
	}

	async render(template: string | TemplateProgram, values: ResolvedVariables, sourcePath?: string): Promise<string> {
		let program: TemplateProgram;
		if (typeof template === 'string') {
			program = this.parser.parse(template);
		} else {
			program = template;
		}

		return this.renderProgram(program, values, sourcePath);
	}

	async renderAst(ast: TemplateAst, values: ResolvedVariables, sourcePath?: string): Promise<RenderedTemplateAst> {
		let renderedAst: RenderedTemplateAst = { body: await this.renderProgram(ast.body, values, sourcePath) };
		if (ast.noteFrontmatter) {
			renderedAst.noteFrontmatter = await this.renderProgram(ast.noteFrontmatter, values, sourcePath);
		}

		if (ast.filename) {
			renderedAst.filename = await this.renderProgram(ast.filename, values, sourcePath);
		}

		if (ast.folder) {
			renderedAst.folder = await this.renderProgram(ast.folder, values, sourcePath);
		}

		return renderedAst;
	}

	private async renderNodes(
		nodes: readonly TemplateNode[],
		values: ResolvedVariables,
		sourcePath: string | undefined,
		output: string[],
	): Promise<void> {
		for (let node of nodes) {
			if (node.type === 'text') {
				output.push(node.value);
				continue;
			}

			if (node.type === 'if') {
				let matched = false;
				for (let branch of node.branches) {
					let value = await this.expressions.evaluateTemplateExpression(branch.expression, values, sourcePath);
					if (!this.isTruthy(value)) continue;
					await this.renderNodes(branch.children, values, sourcePath, output);
					matched = true;
					break;
				}
				if (!matched) {
					await this.renderNodes(node.elseChildren, values, sourcePath, output);
				}
				continue;
			}

			let value = await this.expressions.evaluateTemplateExpression(node.expression, values, sourcePath);
			if (node.type === 'expression') {
				output.push(this.renderValue(value));
			} else {
				let items = this.toItems(value);
				if (items.length === 0) {
					await this.renderNodes(node.emptyChildren, values, sourcePath, output);
					continue;
				}
				for (let item of items) {
					await this.renderNodes(node.children, { ...values, [node.variable]: item }, sourcePath, output);
				}
			}
		}
	}

	private isTruthy(value: unknown): boolean {
		if (value === null || value === undefined || value === false) return false;
		if (typeof value === 'string' || Array.isArray(value)) return value.length > 0;
		if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
		if (typeof value === 'bigint') return value !== 0n;
		return true;
	}

	private toItems(value: unknown): readonly unknown[] {
		if (Array.isArray(value)) return value;
		if (value === null || value === undefined || value === false || value === '') return [];
		return [value];
	}

	private renderValue(value: unknown): string {
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return value.map(item => this.renderValue(item)).join('\n');
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
		try {
			let serialized = JSON.stringify(value);
			return serialized ?? '';
		} catch {
			return '';
		}
	}
}
