import type { Vault } from 'obsidian';
import { TFolder } from 'obsidian';

/** Creates vault-relative folder trees without overwriting files. */
export class VaultFolderService {
	constructor(private readonly vault: Vault) {}

	async ensureExists(folder: string): Promise<void> {
		if (!folder) return;

		let current = '';
		for (let segment of folder.split('/')) {
			current = current ? `${current}/${segment}` : segment;
			let item = this.vault.getAbstractFileByPath(current);
			if (item instanceof TFolder) continue;
			if (item) throw new Error(`The folder path "${current}" is occupied by a file.`);
			await this.vault.createFolder(current);
		}
	}
}
