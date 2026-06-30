import { OutputPathResolver } from 'packages/core/src/index';
import { pathAffectsTemplateRegistry } from 'packages/obsidian/src/templates/RegistryPaths';
import type { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import type { Plugin, TAbstractFile } from 'obsidian';
import { TFile, debounce } from 'obsidian';

/** Registers and filters vault events that can invalidate the template registry. */
export class TemplateRegistryMonitor {
	private readonly paths = new OutputPathResolver();

	constructor(
		private readonly plugin: Plugin,
		private readonly registry: TemplateRegistry,
		private readonly getFolder: () => string,
	) {}

	register(): void {
		let refresh = debounce(
			() => {
				void this.registry.refresh().catch(error => {
					console.error('Simple Templates: registry refresh failed', error);
				});
			},
			250,
			true,
		);
		this.plugin.registerEvent(this.plugin.app.vault.on('create', file => this.scheduleRefresh(file, refresh)));
		this.plugin.registerEvent(this.plugin.app.vault.on('modify', file => this.scheduleRefresh(file, refresh)));
		this.plugin.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => this.scheduleRefresh(file, refresh, oldPath)));
		this.plugin.registerEvent(this.plugin.app.vault.on('delete', file => this.scheduleRefresh(file, refresh)));
	}

	private scheduleRefresh(file: TAbstractFile, refresh: () => void, oldPath?: string): void {
		let folder: string;
		try {
			folder = this.paths.normalizeFolder(this.getFolder());
		} catch {
			return;
		}
		let affectedPaths = oldPath === undefined ? [file.path] : [file.path, oldPath];
		if (pathAffectsTemplateRegistry(folder, affectedPaths, file instanceof TFile)) refresh();
	}
}
