import type { TemplateAst } from 'packages/core/src/domain/TemplateAst';
import type { NoteOutputDefinition } from 'packages/core/src/domain/Types';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';

/** Compiles every templated field belonging to one template definition. */
export class TemplateCompiler {
	constructor(private readonly programs = new TemplateProgramParser()) {}

	compile(body: string, noteFrontmatter: string | undefined, output: NoteOutputDefinition | undefined): TemplateAst {
		return {
			type: 'template',
			body: this.programs.parse(body),
			...(noteFrontmatter !== undefined ? { noteFrontmatter: this.programs.parse(noteFrontmatter) } : {}),
			...(typeof output?.filename === 'string' ? { filename: this.programs.parse(output.filename) } : {}),
			...(output?.folder?.mode === 'path' && typeof output.folder.path === 'string'
				? { folder: this.programs.parse(output.folder.path) }
				: {}),
		};
	}
}
