import type { App, TFile } from 'obsidian';
import { FuzzySuggestModal } from 'obsidian';

export class FilePickerModal extends FuzzySuggestModal<TFile> {
	private resolve: (file: TFile | null) => void = () => undefined;
	private settled = false;

	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly validPaths: Set<string>,
	) {
		super(app);
	}

	choose(): Promise<TFile | null> {
		this.setPlaceholder('Choose a Markdown file…');
		return new Promise(resolve => {
			this.resolve = resolve;
			this.settled = false;
			this.open();
		});
	}

	getItems(): TFile[] {
		return [...this.files].sort((a, b) => Number(this.validPaths.has(b.path)) - Number(this.validPaths.has(a.path)) || a.path.localeCompare(b.path));
	}
	getItemText(file: TFile): string {
		return `${this.validPaths.has(file.path) ? 'Template' : 'Markdown'} — ${file.path}`;
	}
	onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.settle(item);
	}
	override onClose(): void {
		super.onClose();
		// SuggestModal closes before it reports the selected item.
		queueMicrotask(() => this.settle(null));
	}

	private settle(result: TFile | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(result);
	}
}
