import { parseYamlObject } from 'packages/core/src/frontmatter';
import type { FormulaRuntime } from 'packages/core/src/formulas';
import { resolveFilename, resolveOutputFolder } from 'packages/core/src/paths';
import { renderTemplate } from 'packages/core/src/renderer';
import type { SpecialVariableRegistry } from 'packages/core/src/specialVariables';
import type { ExecutionContext, RenderedNote, ResolvedVariables, TemplateDefinition } from 'packages/core/src/types';
import { resolveVariables } from 'packages/core/src/variables';

/**
 * The top-level render pipeline for a single template.
 *
 * 1. Resolves all variable values (user-provided, formula-based, context-driven).
 * 2. Renders the template body and optional output-frontmatter template.
 * 3. Decides the final output folder and filename.
 *
 * Returns everything needed to write the note to the vault.
 */
export function renderNote(
	template: TemplateDefinition,
	specialVariables: SpecialVariableRegistry<unknown>,
	context: ExecutionContext,
	userValues: ResolvedVariables,
	defaultOutputFolderPath: string,
	runtime?: FormulaRuntime,
): RenderedNote & { values: ResolvedVariables; usedFolderFallback: boolean } {
	let values = resolveVariables(template.variables, specialVariables, context, userValues, runtime);
	let declared = new Set(Object.keys(template.variables));

	// Render body and optional output frontmatter separately
	let body = renderTemplate(template.body, values, declared);
	let outputFrontmatter =
		template.outputFrontmatterTemplate === undefined ? '' : renderTemplate(template.outputFrontmatterTemplate, values, declared).trim();

	// Validate the rendered frontmatter is parseable YAML
	if (outputFrontmatter) parseYamlObject(outputFrontmatter);

	// Prepend frontmatter delimiters if an output frontmatter was produced
	let content = outputFrontmatter ? `---\n${outputFrontmatter}\n---\n${body}` : body;

	let { folder, usedFallback } = resolveOutputFolder(template.output?.folder, context, defaultOutputFolderPath, values);

	return {
		content,
		folder,
		filename: resolveFilename(template.output?.filename ?? template.name, values),
		conflict: template.output?.conflict ?? 'prompt',
		openAfterCreate: template.output?.openAfterCreate ?? true,
		values,
		usedFolderFallback: usedFallback,
	};
}
