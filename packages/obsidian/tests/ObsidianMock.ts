import { mock } from 'bun:test';

export class MockTFile {
	constructor(readonly path: string) {}
}

class MockFuzzySuggestModal {
	modalEl = {
		addClass(_className: string): void {},
	};
	setPlaceholder(_placeholder: string): void {}
	open(): void {}
	onClose(): void {}
}

class MockModal {
	contentEl = {
		empty(): void {},
	};
	modalEl = {
		addClass(_className: string): void {},
	};
	open(): void {}
	close(): void {
		this.onClose();
	}
	onClose(): void {}
}

class MockMarkdownView {}

class MockSettingGroup {}

void mock.module('obsidian', function createObsidianMock() {
	return {
		FuzzySuggestModal: MockFuzzySuggestModal,
		MarkdownView: MockMarkdownView,
		Modal: MockModal,
		SettingGroup: MockSettingGroup,
		TFile: MockTFile,
	};
});
