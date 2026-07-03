import { TemplateValidationError } from 'packages/core/src/domain/Errors';

/** Provides deterministic operations for vault-relative paths. */
export class VaultPathService {
	normalizeFolder(path: string): string {
		let normalized = path.replaceAll('\\', '/').trim();
		if (/^(?:\/|[a-zA-Z]:\/)/.test(normalized)) throw new TemplateValidationError('Folder must be vault-relative.');
		let segments = normalized.split('/');
		if (segments.includes('..')) throw new TemplateValidationError('Folder cannot contain path traversal segments.');
		return segments.filter(segment => segment && segment !== '.').join('/');
	}

	join(folder: string, filename: string): string {
		return folder ? `${folder}/${filename}` : filename;
	}
}
