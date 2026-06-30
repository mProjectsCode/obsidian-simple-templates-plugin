import { FormulaEvaluator, SpecialVariableRegistry } from 'packages/core/src/index';
import type { ExecutionContext, FormulaRuntime } from 'packages/core/src/index';

export type ObsidianContextRequirement = 'activeFileContent' | 'editorSelection' | 'clipboard';
export type ObsidianSpecialVariableRegistry = SpecialVariableRegistry<{ requiredContext?: ObsidianContextRequirement }>;

export interface ObsidianExecutionContext extends ExecutionContext {
	activeFilePath: string | null;
	activeFileBasename: string | null;
	activeFileFrontmatter: Record<string, unknown> | null;
	activeFileContent?: string;
	cursor?: { line: number; ch: number } | null;
	editorSelection?: string;
	clipboard?: string;
}

function obsidianContext(context: ExecutionContext): ObsidianExecutionContext {
	return context as ObsidianExecutionContext;
}

/** Creates the core registry and installs every source provided by Obsidian. */
export function createObsidianSpecialVariableRegistry(): ObsidianSpecialVariableRegistry {
	let registry = new SpecialVariableRegistry<{ requiredContext?: ObsidianContextRequirement }>();

	registry
		.register('activeFile.path', {
			label: 'Active file path',
			resolve: context => obsidianContext(context).activeFilePath,
		})
		.register('activeFile.basename', {
			label: 'Active file basename',
			resolve: context => obsidianContext(context).activeFileBasename,
		})
		.register('activeFile.folder', {
			label: 'Active file folder',
			resolve: context => obsidianContext(context).activeFileFolder,
		})
		.register('activeFile.frontmatter', {
			label: 'Active file frontmatter',
			resolve: context => obsidianContext(context).activeFileFrontmatter,
		})
		.register('activeFile.content', {
			label: 'Active file content',
			metadata: { requiredContext: 'activeFileContent' },
			resolve: context => obsidianContext(context).activeFileContent ?? null,
		})
		.register('cursor.line', {
			label: 'Cursor line',
			resolve: context => obsidianContext(context).cursor?.line ?? null,
		})
		.register('cursor.ch', {
			label: 'Cursor column',
			resolve: context => obsidianContext(context).cursor?.ch ?? null,
		})
		.register('editor.selection', {
			label: 'Editor selection',
			metadata: { requiredContext: 'editorSelection' },
			resolve: context => obsidianContext(context).editorSelection ?? null,
		})
		.register('date.today', {
			label: 'Today',
			resolve: (_context: ExecutionContext, runtime?: FormulaRuntime) =>
				FormulaEvaluator.formatLocalDate(runtime?.now() ?? new Date()),
		})
		.register('date.now', {
			label: 'Current date and time',
			resolve: (_context: ExecutionContext, runtime?: FormulaRuntime) => (runtime?.now() ?? new Date()).toISOString(),
		})
		.register('clipboard', {
			label: 'Clipboard',
			metadata: { requiredContext: 'clipboard' },
			resolve: context => obsidianContext(context).clipboard ?? null,
		});

	return registry;
}

export function getRequiredObsidianContext(
	registry: ObsidianSpecialVariableRegistry,
	sources: Iterable<string>,
): Set<ObsidianContextRequirement> {
	let required = new Set<ObsidianContextRequirement>();
	for (let source of sources) {
		let requirement = registry.get(source)?.metadata?.requiredContext;
		if (requirement) required.add(requirement);
	}
	return required;
}
