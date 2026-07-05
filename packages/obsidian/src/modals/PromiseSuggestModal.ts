import type { App } from 'obsidian';
import { FuzzySuggestModal } from 'obsidian';

/** Shared promise lifecycle for suggest modals that return one selection. */
export abstract class PromiseSuggestModal<Item> extends FuzzySuggestModal<Item> {
	private resolve: (item: Item | null) => void = () => undefined;
	private settled = false;

	protected constructor(app: App, placeholder: string) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
		this.setPlaceholder(placeholder);
	}

	choose(): Promise<Item | null> {
		return new Promise(resolve => {
			this.resolve = resolve;
			this.settled = false;
			this.open();
		});
	}

	onChooseItem(item: Item, _event: MouseEvent | KeyboardEvent): void {
		this.settle(item);
	}

	override onClose(): void {
		super.onClose();
		// SuggestModal fires `onChooseItem` before `onClose`. Deferring the
		// fallback also handles hosts that report those callbacks in reverse.
		queueMicrotask(() => this.settle(null));
	}

	private settle(result: Item | null): void {
		if (this.settled) return;

		this.settled = true;
		this.resolve(result);
	}
}
