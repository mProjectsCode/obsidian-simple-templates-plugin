import { FileConflictError, VaultPathService } from 'packages/core/src/index';
import type { FileConflictStrategy } from 'packages/core/src/index';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import type { App } from 'obsidian';

/** Resolves an available vault path, including user-driven conflict handling. */
export class NoteDestinationResolver {
	private readonly paths = new VaultPathService();

	constructor(private readonly app: App) {}

	async resolve(folder: string, filename: string, strategy: FileConflictStrategy): Promise<string | null> {
		let desiredPath = this.paths.join(folder, filename);
		if (!this.exists(desiredPath)) return desiredPath;
		if (strategy === 'cancel') throw new FileConflictError(`A note already exists at "${desiredPath}".`);

		if (strategy === 'prompt') {
			let append = await new ConfirmModal(
				this.app,
				'Note already exists',
				`A note already exists at “${desiredPath}”. Create a numbered note instead?`,
				'Append number',
			).confirm();
			if (!append) return null;
		}

		return this.findAvailableNumberedPath(desiredPath);
	}

	private findAvailableNumberedPath(desiredPath: string): string {
		let extensionIndex = desiredPath.toLowerCase().endsWith('.md') ? desiredPath.length - 3 : desiredPath.length;
		let stem = desiredPath.slice(0, extensionIndex);
		let extension = desiredPath.slice(extensionIndex);
		for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
			let candidate = `${stem} ${index}${extension}`;
			if (!this.exists(candidate)) return candidate;
		}
		throw new FileConflictError(`Could not find an available filename for "${desiredPath}".`);
	}

	private exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}
}
