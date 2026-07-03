import { TemplateValidationError } from 'packages/core/src/domain/Errors';
import type { OutputFolderDefinition } from 'packages/core/src/domain/Types';
import type { OutputFolderProvider, ResolvedOutputFolder } from 'packages/core/src/output/OutputFolderProvider';
import { VaultPathService } from 'packages/core/src/output/VaultPathService';

/** Resolves rendered output configuration into a safe folder and filename. */
export class OutputPathResolver {
	constructor(private readonly paths = new VaultPathService()) {}

	resolveFolder(
		definition: OutputFolderDefinition | undefined,
		provider: OutputFolderProvider,
		renderedPath?: string,
	): ResolvedOutputFolder {
		let selected = definition ?? { mode: 'default' as const };
		if (selected.mode === 'same-as-active-file') {
			let folder = provider.getActiveFileFolder();
			return folder === null
				? { folder: this.paths.normalizeFolder(provider.getDefaultFolder()), usedFolderFallback: true }
				: { folder: this.paths.normalizeFolder(folder), usedFolderFallback: false };
		}
		let path = selected.mode === 'path' ? provider.getExplicitFolder(renderedPath ?? selected.path) : provider.getDefaultFolder();
		return { folder: this.paths.normalizeFolder(path), usedFolderFallback: false };
	}

	resolveFilename(renderedTemplate: string): string {
		let rendered = renderedTemplate.trim().replace(/\s+/g, ' ');
		if (rendered.includes('/') || rendered.includes('\\'))
			throw new TemplateValidationError('Output filename cannot contain path separators.');
		let cleaned = [...rendered]
			.map(character => (character.charCodeAt(0) < 32 || '<>:"|?*'.includes(character) ? '-' : character))
			.join('')
			.replace(/[. ]+$/g, '')
			.trim();
		if (!cleaned) throw new TemplateValidationError('Output filename is empty.');
		return /\.md$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
	}
}
