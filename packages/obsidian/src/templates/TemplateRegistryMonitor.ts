import { VaultPathService } from 'packages/core/src/index';
import { pathAffectsTemplateRegistry } from 'packages/obsidian/src/templates/RegistryPaths';
import type { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import type { Plugin, TAbstractFile } from 'obsidian';
import { TFile, debounce } from 'obsidian';

/** Registers and filters vault events that can invalidate the template registry. */
export class TemplateRegistryMonitor {
	private readonly paths = new VaultPathService();

	constructor(
		private readonly plugin: Plugin,
		private readonly registry: TemplateRegistry,
		private readonly getFolder: () => string,
	) {}

	register(): void {
		let pendingFiles = new Map<string, TFile>();
		let refreshFiles = debounce(
			() => {
				let files = [...pendingFiles.values()];
				pendingFiles.clear();
				void Promise.all(files.map(file => this.registry.refreshFile(file))).catch(error => {
					console.error('Simple Templates: registry file refresh failed', error);
				});
			},
			250,
			true,
		);
		this.plugin.register(() => {
			refreshFiles.cancel();
			pendingFiles.clear();
		});
		let scheduleFile = (file: TAbstractFile): void => {
			if (!(file instanceof TFile) || !this.affectsRegistry(file)) return;
			pendingFiles.set(file.path, file);
			refreshFiles();
		};
		let refreshAll = (file: TAbstractFile, oldPath?: string): void => {
			if (!this.affectsRegistry(file, oldPath)) return;
			void this.registry.refresh().catch(error => console.error('Simple Templates: registry refresh failed', error));
		};
		this.plugin.registerEvent(this.plugin.app.vault.on('create', scheduleFile));
		this.plugin.registerEvent(this.plugin.app.vault.on('modify', scheduleFile));
		this.plugin.registerEvent(this.plugin.app.vault.on('rename', refreshAll));
		this.plugin.registerEvent(this.plugin.app.vault.on('delete', refreshAll));
	}

	private affectsRegistry(file: TAbstractFile, oldPath?: string): boolean {
		let folder: string;
		try {
			folder = this.paths.normalizeFolder(this.getFolder());
		} catch {
			return false;
		}
		let affectedPaths = oldPath === undefined ? [file.path] : [file.path, oldPath];
		return pathAffectsTemplateRegistry(folder, affectedPaths, file instanceof TFile);
	}
}
