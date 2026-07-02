import { OutputPathResolver, TemplateEngine } from 'packages/core/src/index';
import type { FileConflictStrategy, TemplateDefinition } from 'packages/core/src/index';
import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { TemplatePickerModal } from 'packages/obsidian/src/modals/TemplatePickerModal';
import { VariableInputModal } from 'packages/obsidian/src/modals/VariableInputModal';
import { getRequiredObsidianContext } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { ObsidianExecutionContext } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { SafeJsExpressionEvaluator } from 'packages/obsidian/src/expressions/SafeJsExpressionEvaluator';
import { getSafeJsApi } from '@lemons_dev/obsidian-safe-js-api';
import { MarkdownView, Notice, TFolder } from 'obsidian';

export class NoteTemplateExecutor {
	private readonly paths = new OutputPathResolver();

	constructor(private readonly plugin: SimpleTemplatesPlugin) {}

	/**
	 * The full "create note from template" flow:
	 *
	 * 1. Pick a template (if not pre-selected).
	 * 2. Capture the editor / vault context.
	 * 3. Prompt the user for variable values.
	 * 4. Render the note.
	 * 5. Resolve the output path (handling conflicts).
	 * 6. Write the file and optionally open it.
	 */
	async execute(template?: TemplateDefinition): Promise<void> {
		try {
			// ---- Step 1: Pick a template ----
			let templates = this.plugin.registry.getAll();
			if (!template && templates.length === 0) {
				new Notice('No valid templates were found in the configured template folder.');
				return;
			}
			let selected = template ?? (await new TemplatePickerModal(this.plugin.app, templates).choose());
			if (!selected) return;

			// ---- Step 2: Capture context ----
			let context = await this.captureContext(selected);

			// ---- Step 3: Prompt for user input ----
			let userValues = await new VariableInputModal(this.plugin.app, selected.variables).collect();
			if (userValues === null) return;

			// ---- Step 4: Render ----
			let safeJsApi = getSafeJsApi(this.plugin.app, this.plugin);
			if (!safeJsApi) throw new Error('Safe JS must be installed and enabled to evaluate template expressions.');
			let engine = new TemplateEngine(this.plugin.specialVariables, new SafeJsExpressionEvaluator(safeJsApi));
			let rendered = await engine.render(selected, context, userValues, this.plugin.settings.defaultOutputFolderPath);
			if (rendered.usedFolderFallback) new Notice('No active file was available; using the default output folder.');

			// ---- Step 5: Ensure output folder exists ----
			if (!(await this.ensureFolder(rendered.folder))) return;

			// ---- Step 6: Resolve output path (handle conflicts) ----
			let path = await this.resolveOutputPath(rendered.folder, rendered.filename, rendered.conflict);
			if (!path) return;

			// ---- Step 7: Write file ----
			let file = await this.plugin.app.vault.create(path, rendered.content);
			if (rendered.openAfterCreate) await this.plugin.app.workspace.getLeaf(false).openFile(file);

			new Notice(`Created “${path}”.`);
		} catch (error) {
			console.error('Simple Templates: note creation failed', error);
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * Determines the final write path, handling conflicts.
	 *
	 * When the strategy is `prompt` and a file already exists, the user is
	 * asked whether to append a numeric suffix.  If they decline, creation
	 * is cancelled (`null` is returned).
	 */
	private async resolveOutputPath(folder: string, filename: string, strategy: FileConflictStrategy): Promise<string | null> {
		let desiredPath = this.paths.join(folder, filename);

		if (strategy === 'prompt' && this.plugin.app.vault.getAbstractFileByPath(desiredPath)) {
			let append = await new ConfirmModal(
				this.plugin.app,
				'Note already exists',
				`A note already exists at “${desiredPath}”. Create a numbered note instead?`,
				'Append number',
			).confirm();
			if (!append) return null;
			strategy = 'append-number';
		}

		return this.paths.findAvailable(
			desiredPath,
			strategy === 'prompt' ? 'cancel' : strategy,
			candidate => this.plugin.app.vault.getAbstractFileByPath(candidate) !== null,
		);
	}

	/**
	 * Gathers the execution context from the current Obsidian editor
	 * state.  Only reads expensive sources (file content, clipboard) when the
	 * template actually needs them.
	 */
	private async captureContext(template: TemplateDefinition): Promise<ObsidianExecutionContext> {
		let activeFile = this.plugin.app.workspace.getActiveFile();
		let view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

		let sources = Object.values(template.variables).flatMap(definition => (definition.type === 'special' ? [definition.source] : []));
		let requiredContext = getRequiredObsidianContext(this.plugin.specialVariables, sources);

		let context: ObsidianExecutionContext = {
			activeFilePath: activeFile?.path ?? null,
			activeFileBasename: activeFile?.basename ?? null,
			activeFileFolder: activeFile?.parent?.path ?? null,
			activeFileFrontmatter: activeFile ? (this.plugin.app.metadataCache.getFileCache(activeFile)?.frontmatter ?? null) : null,
			cursor: view ? view.editor.getCursor() : null,
		};

		if (requiredContext.has('activeFileContent'))
			context.activeFileContent = activeFile ? await this.plugin.app.vault.cachedRead(activeFile) : undefined;
		if (requiredContext.has('editorSelection')) context.editorSelection = view?.editor.getSelection() ?? undefined;
		if (requiredContext.has('clipboard')) {
			try {
				context.clipboard = await navigator.clipboard.readText();
			} catch {
				context.clipboard = undefined;
			}
		}

		return context;
	}

	/**
	 * Ensures a vault folder exists.  Prompts the user for confirmation when
	 * the folder does not exist yet, then creates it (and any missing parents).
	 */
	private async ensureFolder(folder: string): Promise<boolean> {
		if (!folder) return true;

		let existing = this.plugin.app.vault.getAbstractFileByPath(folder);
		if (existing instanceof TFolder) return true;
		if (existing) throw new Error(`The output path “${folder}” is not a folder.`);

		let create = await new ConfirmModal(
			this.plugin.app,
			'Create output folder',
			`The folder “${folder}” does not exist. Create it?`,
			'Create folder',
		).confirm();
		if (!create) return false;

		// Create each segment one at a time
		let current = '';
		for (let segment of folder.split('/')) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.plugin.app.vault.getAbstractFileByPath(current)) await this.plugin.app.vault.createFolder(current);
		}

		return true;
	}
}
