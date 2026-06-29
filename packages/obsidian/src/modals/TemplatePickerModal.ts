import type { TemplateDefinition } from 'packages/core/src/index';
import type { App } from 'obsidian';
import { FuzzySuggestModal } from 'obsidian';

export class TemplatePickerModal extends FuzzySuggestModal<TemplateDefinition> {
	private resolve: (template: TemplateDefinition | null) => void = () => undefined;
	private settled = false;

	constructor(
		app: App,
		private readonly templates: TemplateDefinition[],
	) {
		super(app);
	}

	choose(): Promise<TemplateDefinition | null> {
		this.setPlaceholder('Choose a template…');
		return new Promise(resolve => {
			this.resolve = resolve;
			this.settled = false;
			this.open();
		});
	}

	getItems(): TemplateDefinition[] {
		return this.templates;
	}
	getItemText(template: TemplateDefinition): string {
		return template.description ? `${template.name} — ${template.description}` : template.name;
	}
	onChooseItem(item: TemplateDefinition, _evt: MouseEvent | KeyboardEvent): void {
		this.settle(item);
	}
	override onClose(): void {
		super.onClose();
		// SuggestModal closes before it reports the selected item.
		queueMicrotask(() => this.settle(null));
	}

	private settle(result: TemplateDefinition | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(result);
	}
}
