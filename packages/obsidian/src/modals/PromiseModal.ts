import type { App } from 'obsidian';
import { Modal } from 'obsidian';

/** Shared promise and cancellation lifecycle for result-producing modals. */
export abstract class PromiseModal<Result> extends Modal {
	private resolve: (result: Result) => void = () => undefined;
	private settled = false;

	protected constructor(
		app: App,
		private readonly cancelledResult: Result,
	) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
	}

	protected awaitResult(): Promise<Result> {
		return new Promise(resolve => {
			this.resolve = resolve;
			this.settled = false;
			this.open();
		});
	}

	protected submitResult(result: Result): void {
		this.settle(result);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.settle(this.cancelledResult);
	}

	private settle(result: Result): void {
		if (this.settled) return;

		this.settled = true;
		this.resolve(result);
	}
}
