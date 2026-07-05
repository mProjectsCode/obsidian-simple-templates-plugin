import { getSafeJsApi } from '@lemons_dev/obsidian-safe-js-api';
import { TemplateEngine } from 'packages/core/src/index';
import type { TemplateDefinition } from 'packages/core/src/index';
import { SafeJsExpressionEvaluator } from 'packages/obsidian/src/expressions/SafeJsExpressionEvaluator';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { TemplatePickerModal } from 'packages/obsidian/src/modals/TemplatePickerModal';
import { VariableInputModal } from 'packages/obsidian/src/modals/VariableInputModal';
import { ObsidianVariableEnvironment } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { NoteDestinationResolver } from 'packages/obsidian/src/notes/NoteDestinationResolver';
import { ObsidianOutputFolderProvider } from 'packages/obsidian/src/notes/ObsidianOutputFolderProvider';
import type { PluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import type { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { VaultFolderService } from 'packages/obsidian/src/vault/VaultFolderService';
import type { Plugin } from 'obsidian';
import { Notice } from 'obsidian';

export interface NoteTemplateExecutorDependencies {
	plugin: Plugin;
	registry: TemplateRegistry;
	specialVariables: ObsidianSpecialVariableRegistry;
	getSettings(): PluginSettings;
}

export class NoteTemplateExecutor {
	private readonly destinations: NoteDestinationResolver;
	private readonly folders: VaultFolderService;

	constructor(private readonly dependencies: NoteTemplateExecutorDependencies) {
		this.destinations = new NoteDestinationResolver(dependencies.plugin.app);
		this.folders = new VaultFolderService(dependencies.plugin.app.vault);
	}

	/**
	 * The full "create note from template" flow:
	 *
	 * 1. Pick a template (if not pre-selected).
	 * 2. Prompt the user for variable values.
	 * 3. Render the note with an execution-scoped variable environment.
	 * 4. Ensure and resolve the output path (handling conflicts).
	 * 5. Write the file and optionally open it.
	 */
	async execute(template?: TemplateDefinition): Promise<void> {
		try {
			// ---- Step 1: Pick a template ----
			let templates = this.dependencies.registry.getAll();
			if (!template && templates.length === 0) {
				new Notice('No valid templates were found in the configured template folder.');
				return;
			}
			let selected = template ?? (await new TemplatePickerModal(this.dependencies.plugin.app, templates).choose());
			if (!selected) return;

			// ---- Step 2: Prompt for user input ----
			let userValues = await new VariableInputModal(this.dependencies.plugin.app, selected.variables).collect();
			if (userValues === null) return;

			// ---- Step 3: Render ----
			let engine = new TemplateEngine(
				this.dependencies.specialVariables,
				new SafeJsExpressionEvaluator(() => getSafeJsApi(this.dependencies.plugin.app, this.dependencies.plugin) ?? null),
				new ObsidianOutputFolderProvider(this.dependencies.plugin.app, this.dependencies.getSettings().defaultOutputFolderPath),
			);
			let environment = new ObsidianVariableEnvironment(this.dependencies.plugin.app);
			let rendered = await engine.render(selected, environment, userValues);
			if (rendered.usedFolderFallback) new Notice('No active file was available; using the default output folder.');

			// ---- Step 4: Ensure output folder exists ----
			if (!(await this.ensureFolder(rendered.folder))) return;

			// ---- Step 5: Resolve output path (handle conflicts) ----
			let path = await this.destinations.resolve(rendered.folder, rendered.filename, rendered.conflict);
			if (!path) return;

			// ---- Step 6: Write file ----
			let file = await this.dependencies.plugin.app.vault.create(path, rendered.content);
			if (rendered.openAfterCreate) await this.dependencies.plugin.app.workspace.getLeaf(false).openFile(file);

			new Notice(`Created "${path}".`);
		} catch (error) {
			console.error('Simple Templates: note creation failed', error);
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * Ensures a vault folder exists.  Prompts the user for confirmation when
	 * the folder does not exist yet, then creates it (and any missing parents).
	 */
	private async ensureFolder(folder: string): Promise<boolean> {
		if (!folder) return true;

		let existing = this.dependencies.plugin.app.vault.getAbstractFileByPath(folder);
		if (existing) {
			await this.folders.ensureExists(folder);
			return true;
		}

		let create = await new ConfirmModal(
			this.dependencies.plugin.app,
			'Create output folder',
			`The folder "${folder}" does not exist. Create it?`,
			'Create folder',
		).confirm();
		if (!create) return false;

		await this.folders.ensureExists(folder);
		return true;
	}
}
