import type { OutputFolderProvider } from 'packages/core/src/index';
import type { App } from 'obsidian';

/** Supplies Obsidian-specific folder values to the core template engine. */
export class ObsidianOutputFolderProvider implements OutputFolderProvider {
	constructor(
		private readonly app: App,
		private readonly defaultFolder: string,
	) {}

	getDefaultFolder(): string {
		return this.defaultFolder;
	}

	getActiveFileFolder(): string | null {
		return this.app.workspace.getActiveFile()?.parent?.path ?? null;
	}

	getExplicitFolder(path: string): string {
		return path;
	}
}
