import type { ExecutionContext, RenderedNote, ResolvedVariables, TemplateDefinition } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import { FrontmatterService } from 'packages/core/src/frontmatter/FrontmatterService';
import { OutputPathResolver } from 'packages/core/src/output/OutputPathResolver';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';
import { TemplateRenderer } from 'packages/core/src/templates/TemplateRenderer';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';
import { VariableResolver } from 'packages/core/src/variables/VariableResolver';

/**
 * The top-level render pipeline for a single template.
 *
 * 1. Resolves all variable values (user-provided, expression-based, context-driven).
 * 2. Renders the template body and optional output-frontmatter template.
 * 3. Decides the final output folder and filename.
 *
 * Returns everything needed to write the note to the vault.
 */
export class TemplateEngine {
	private readonly variables: VariableResolver;

	constructor(
		specialVariables: SpecialVariableRegistry<unknown>,
		expressions: ExpressionEvaluator,
		private readonly frontmatter = new FrontmatterService(),
		private readonly paths = new OutputPathResolver(),
		private readonly programParser = new TemplateProgramParser(),
		private readonly renderer = new TemplateRenderer(programParser),
	) {
		this.variables = new VariableResolver(specialVariables, expressions);
	}

	async render(
		template: TemplateDefinition,
		context: ExecutionContext,
		userValues: ResolvedVariables,
		defaultOutputFolderPath: string,
	): Promise<RenderedNote & { values: ResolvedVariables; usedFolderFallback: boolean }> {
		let values = await this.variables.resolve(template.variables, context, userValues, template.sourcePath);
		let declared = new Set(Object.keys(template.variables));
		let ast =
			template.ast ??
			({
				type: 'template',
				body: this.programParser.parse(template.body),
				...(template.outputFrontmatterTemplate !== undefined
					? { noteFrontmatter: this.programParser.parse(template.outputFrontmatterTemplate) }
					: {}),
				...(typeof template.output?.filename === 'string' ? { filename: this.programParser.parse(template.output.filename) } : {}),
				...(template.output?.folder?.mode === 'path' && typeof template.output.folder.path === 'string'
					? { folder: this.programParser.parse(template.output.folder.path) }
					: {}),
			} as const);
		let rendered = this.renderer.renderAst(ast, values, declared);
		let outputFrontmatter = rendered.noteFrontmatter?.trim() ?? '';

		// Validate the rendered frontmatter is parseable YAML
		if (outputFrontmatter) this.frontmatter.parseYamlObject(outputFrontmatter);

		// Prepend frontmatter delimiters if an output frontmatter was produced
		let content = outputFrontmatter ? `---\n${outputFrontmatter}\n---\n${rendered.body}` : rendered.body;

		let { folder, usedFallback } = this.paths.resolveFolder(
			template.output?.folder,
			context,
			defaultOutputFolderPath,
			values,
			rendered.folder,
		);

		return {
			content,
			folder,
			filename: this.paths.resolveFilename(template.output?.filename ?? template.name, values, rendered.filename),
			conflict: template.output?.conflict ?? 'prompt',
			openAfterCreate: template.output?.openAfterCreate ?? true,
			values,
			usedFolderFallback: usedFallback,
		};
	}
}
