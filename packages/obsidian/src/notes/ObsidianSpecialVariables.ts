import { SpecialVariableRegistry } from 'packages/core/src/index';
import type { App, TFile } from 'obsidian';

/** Execution-scoped, lazily loaded values available to Obsidian special variables. */
export class ObsidianVariableEnvironment {
	private readonly activeFile: TFile | null;
	private readonly activeFileFrontmatter: Record<string, unknown> | null;
	private activeFileContent?: Promise<string | null>;
	private clipboard?: Promise<string | null>;

	constructor(private readonly app: App) {
		this.activeFile = app.workspace.getActiveFile();
		this.activeFileFrontmatter = this.activeFile ? (app.metadataCache.getFileCache(this.activeFile)?.frontmatter ?? null) : null;
	}

	getActiveFilePath(): string | null {
		return this.activeFile?.path ?? null;
	}

	getActiveFileBasename(): string | null {
		return this.activeFile?.basename ?? null;
	}

	getActiveFileFolder(): string | null {
		return this.activeFile?.parent?.path ?? null;
	}

	getActiveFileFrontmatter(): Record<string, unknown> | null {
		return this.activeFileFrontmatter;
	}

	getActiveFileContent(): Promise<string | null> {
		this.activeFileContent ??= this.activeFile ? this.app.vault.cachedRead(this.activeFile) : Promise.resolve(null);
		return this.activeFileContent;
	}

	getClipboard(): Promise<string | null> {
		this.clipboard ??= this.readClipboard();
		return this.clipboard;
	}

	private async readClipboard(): Promise<string | null> {
		try {
			return await navigator.clipboard.readText();
		} catch {
			return null;
		}
	}
}

export type ObsidianSpecialVariableRegistry = SpecialVariableRegistry<ObsidianVariableEnvironment>;

/** Creates the core registry and installs every source provided by Obsidian. */
export function createObsidianSpecialVariableRegistry(): ObsidianSpecialVariableRegistry {
	let registry = new SpecialVariableRegistry<ObsidianVariableEnvironment>();

	registry
		.register('activeFile.path', {
			label: 'Active file path',
			resolve: environment => environment.getActiveFilePath(),
		})
		.register('activeFile.basename', {
			label: 'Active file basename',
			resolve: environment => environment.getActiveFileBasename(),
		})
		.register('activeFile.folder', {
			label: 'Active file folder',
			resolve: environment => environment.getActiveFileFolder(),
		})
		.register('activeFile.frontmatter', {
			label: 'Active file frontmatter',
			resolve: environment => environment.getActiveFileFrontmatter(),
		})
		.register('activeFile.content', {
			label: 'Active file content',
			resolve: environment => environment.getActiveFileContent(),
		})
		.register('clipboard', {
			label: 'Clipboard',
			resolve: environment => environment.getClipboard(),
		});

	return registry;
}
