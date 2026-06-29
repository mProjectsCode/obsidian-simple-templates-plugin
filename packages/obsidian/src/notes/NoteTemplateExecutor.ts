import { findAvailablePath, getSpecialValue, joinVaultPath, renderNote } from 'packages/core/src/index';
import type { ExecutionContext, TemplateDefinition } from 'packages/core/src/index';
import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { TemplatePickerModal } from 'packages/obsidian/src/modals/TemplatePickerModal';
import { VariableInputModal } from 'packages/obsidian/src/modals/VariableInputModal';
import { MarkdownView, Notice, TFolder } from 'obsidian';

export class NoteTemplateExecutor {
	constructor(private readonly plugin: SimpleTemplatesPlugin) {}

	async execute(template?: TemplateDefinition): Promise<void> {
		try {
			let templates = this.plugin.registry.getAll();
			if (!template && templates.length === 0) {
				new Notice('No valid templates were found in the configured template folder.');
				return;
			}
			let selected = template ?? (await new TemplatePickerModal(this.plugin.app, templates).choose());
			if (!selected) return;
			let context = await this.captureContext(selected);
			let initialValues = Object.fromEntries(
				Object.entries(selected.variables)
					.filter(([, definition]) => definition.ask === true && definition.source)
					.map(([name, definition]) => [name, getSpecialValue(definition.source!, context)]),
			);
			let userValues = await new VariableInputModal(this.plugin.app, selected.variables, initialValues).collect();
			if (userValues === null) return;
			let rendered = renderNote(selected, context, userValues, this.plugin.settings.defaultOutputFolderPath);
			if (rendered.usedFolderFallback) new Notice('No active file was available; using the default output folder.');
			if (!(await this.ensureFolder(rendered.folder))) return;
			let desiredPath = joinVaultPath(rendered.folder, rendered.filename);
			let strategy = rendered.conflict;
			if (strategy === 'prompt' && this.plugin.app.vault.getAbstractFileByPath(desiredPath)) {
				let append = await new ConfirmModal(
					this.plugin.app,
					'Note already exists',
					`A note already exists at “${desiredPath}”. Create a numbered note instead?`,
					'Append number',
				).confirm();
				if (!append) return;
				strategy = 'append-number';
			}
			let path = findAvailablePath(
				desiredPath,
				strategy === 'prompt' ? 'cancel' : strategy,
				candidate => this.plugin.app.vault.getAbstractFileByPath(candidate) !== null,
			);
			let file = await this.plugin.app.vault.create(path, rendered.content);
			if (rendered.openAfterCreate) await this.plugin.app.workspace.getLeaf(false).openFile(file);
			new Notice(`Created “${path}”.`);
		} catch (error) {
			console.error('Simple Templates: note creation failed', error);
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private async captureContext(template: TemplateDefinition): Promise<ExecutionContext> {
		let activeFile = this.plugin.app.workspace.getActiveFile();
		let view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		let sources = new Set(
			Object.values(template.variables)
				.map(definition => definition.source)
				.filter(Boolean),
		);
		let context: ExecutionContext = {
			activeFilePath: activeFile?.path ?? null,
			activeFileBasename: activeFile?.basename ?? null,
			activeFileFolder: activeFile?.parent?.path ?? null,
			activeFileFrontmatter: activeFile ? (this.plugin.app.metadataCache.getFileCache(activeFile)?.frontmatter ?? null) : null,
			cursor: view ? view.editor.getCursor() : null,
		};
		if (sources.has('activeFile.content')) context.activeFileContent = activeFile ? await this.plugin.app.vault.cachedRead(activeFile) : undefined;
		if (sources.has('editor.selection')) context.editorSelection = view?.editor.getSelection() ?? undefined;
		if (sources.has('clipboard')) {
			try {
				context.clipboard = await navigator.clipboard.readText();
			} catch {
				context.clipboard = undefined;
			}
		}
		return context;
	}

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
		let current = '';
		for (let segment of folder.split('/')) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.plugin.app.vault.getAbstractFileByPath(current)) await this.plugin.app.vault.createFolder(current);
		}
		return true;
	}
}
