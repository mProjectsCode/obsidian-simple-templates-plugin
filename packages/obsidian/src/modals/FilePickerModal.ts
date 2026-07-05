import type { App, TFile } from 'obsidian';
import { PromiseSuggestModal } from 'packages/obsidian/src/modals/PromiseSuggestModal';

/**
 * A fuzzy-suggest modal for picking an arbitrary Markdown file from the vault.
 * Files that are registered as valid templates are shown with a "Template"
 * badge, while other Markdown files are labelled "Markdown".
 */
export class FilePickerModal extends PromiseSuggestModal<TFile> {
	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly validPaths: Set<string>,
	) {
		super(app, 'Choose a Markdown file…');
	}

	getItems(): TFile[] {
		return [...this.files].sort(
			(a, b) => Number(this.validPaths.has(b.path)) - Number(this.validPaths.has(a.path)) || a.path.localeCompare(b.path),
		);
	}

	getItemText(file: TFile): string {
		return `${this.validPaths.has(file.path) ? 'Template' : 'Markdown'}: ${file.path}`;
	}
}
