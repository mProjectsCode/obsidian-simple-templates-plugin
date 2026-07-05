import type { RenderedNote, ResolvedVariables, TemplateDefinition } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import { FrontmatterService } from 'packages/core/src/frontmatter/FrontmatterService';
import type { OutputFolderProvider } from 'packages/core/src/output/OutputFolderProvider';
import { OutputPathResolver } from 'packages/core/src/output/OutputPathResolver';
import { TemplateCompiler } from 'packages/core/src/templates/TemplateCompiler';
import { TemplateRenderer } from 'packages/core/src/templates/TemplateRenderer';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';
import { VariableResolver } from 'packages/core/src/variables/VariableResolver';

/**
 * The top-level render pipeline for a single template.
 *
 * 1. Resolves all variable values (user-provided, expression-based, environment-backed).
 * 2. Renders the template body and optional output-frontmatter template.
 * 3. Decides the final output folder and filename.
 *
 * Returns everything needed to write the note to the vault.
 */
export class TemplateEngine<Environment> {
	private readonly variables: VariableResolver<Environment>;
	private readonly renderer: TemplateRenderer;

	constructor(
		specialVariables: SpecialVariableRegistry<Environment>,
		expressions: ExpressionEvaluator,
		private readonly outputFolders: OutputFolderProvider,
		private readonly frontmatter = new FrontmatterService(),
		private readonly paths = new OutputPathResolver(),
		private readonly compiler = new TemplateCompiler(),
	) {
		this.variables = new VariableResolver(specialVariables, expressions);
		this.renderer = new TemplateRenderer(expressions);
	}

	async render(template: TemplateDefinition, environment: Environment, userValues: ResolvedVariables): Promise<RenderedNote> {
		let values = await this.variables.resolve(template.variables, environment, userValues, template.sourcePath);
		let ast = template.ast ?? this.compiler.compile(template.body, template.outputFrontmatterTemplate, template.output);
		let rendered = await this.renderer.renderAst(ast, values, template.sourcePath);
		let outputFrontmatter = rendered.noteFrontmatter?.trim() ?? '';

		// Validate the rendered frontmatter is parseable YAML
		if (outputFrontmatter) this.frontmatter.parseYamlObject(outputFrontmatter);

		// Prepend frontmatter delimiters if an output frontmatter was produced
		let content = outputFrontmatter ? `---\n${outputFrontmatter}\n---\n${rendered.body}` : rendered.body;

		let { folder, usedFolderFallback } = this.paths.resolveFolder(template.output?.folder, this.outputFolders, rendered.folder);

		return {
			content,
			folder,
			filename: this.paths.resolveFilename(rendered.filename ?? template.name),
			conflict: template.output?.conflict ?? 'prompt',
			openAfterCreate: template.output?.openAfterCreate ?? true,
			values,
			usedFolderFallback,
		};
	}
}
