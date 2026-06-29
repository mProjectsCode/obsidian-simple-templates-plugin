import { parseYamlObject } from 'packages/core/src/frontmatter';
import type { FormulaRuntime } from 'packages/core/src/formulas';
import { resolveFilename, resolveOutputFolder } from 'packages/core/src/paths';
import { renderTemplate } from 'packages/core/src/renderer';
import type { ExecutionContext, RenderedNote, ResolvedVariables, TemplateDefinition } from 'packages/core/src/types';
import { resolveVariables } from 'packages/core/src/variables';

export function renderNote(
	template: TemplateDefinition,
	context: ExecutionContext,
	userValues: ResolvedVariables,
	defaultOutputFolderPath: string,
	runtime?: FormulaRuntime,
): RenderedNote & { values: ResolvedVariables; usedFolderFallback: boolean } {
	let values = resolveVariables(template.variables, context, userValues, runtime);
	let declared = new Set(Object.keys(template.variables));
	let body = renderTemplate(template.body, values, declared);
	let outputFrontmatter = template.outputFrontmatterTemplate === undefined ? '' : renderTemplate(template.outputFrontmatterTemplate, values, declared).trim();
	if (outputFrontmatter) parseYamlObject(outputFrontmatter);
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
