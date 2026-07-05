import { isValidTemplateId, VaultPathService } from 'packages/core/src/index';

export interface TemplateCreationRequest {
	name: string;
	id: string;
	filename: string;
}

/** Derives and validates the user-controlled identity of a new template file. */
export class TemplateCreationService {
	private readonly paths = new VaultPathService();

	defaultsForName(name: string): Pick<TemplateCreationRequest, 'id' | 'filename'> {
		let slug = name
			.normalize('NFKD')
			.replace(/\p{M}+/gu, '')
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		let filename = '';
		if (slug) filename = `${slug}.md`;

		return { id: slug, filename };
	}

	normalize(request: TemplateCreationRequest): TemplateCreationRequest {
		let normalized = {
			name: request.name.trim(),
			id: request.id.trim(),
			filename: request.filename.trim(),
		};
		if (!normalized.name) throw new Error('Enter a template name.');
		if (!normalized.id) throw new Error('Enter a template ID.');
		if (!isValidTemplateId(normalized.id)) throw new Error('Template ID can contain only letters, numbers, underscores, and hyphens.');
		if (!normalized.filename) throw new Error('Enter a file name.');
		if (this.paths.hasPathSeparator(normalized.filename)) throw new Error('File name cannot contain path separators.');
		if (this.paths.hasUnsupportedFilenameCharacters(normalized.filename)) throw new Error('File name contains unsupported characters.');
		if (/[. ]$/.test(normalized.filename)) throw new Error('File name cannot end with a dot or space.');
		if (/^\.md$/i.test(normalized.filename)) throw new Error('Enter a file name before the Markdown extension.');
		let filename = this.paths.ensureMarkdownExtension(normalized.filename);

		return { ...normalized, filename };
	}
}
