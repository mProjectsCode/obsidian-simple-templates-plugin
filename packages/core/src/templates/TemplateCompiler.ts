import type { TemplateAst } from 'packages/core/src/domain/TemplateAst';
import type { NoteOutputDefinition } from 'packages/core/src/domain/Types';
import { TemplateProgramParser } from 'packages/core/src/templates/TemplateProgramParser';

/** Compiles every templated field belonging to one template definition. */
export class TemplateCompiler {
	constructor(private readonly programParser = new TemplateProgramParser()) {}

	compile(body: string, noteFrontmatter: string | undefined, output: NoteOutputDefinition | undefined): TemplateAst {
		let templateAst: TemplateAst = {
			type: 'template',
			body: this.programParser.parse(body),
		};
		if (noteFrontmatter !== undefined) {
			templateAst.noteFrontmatter = this.programParser.parse(noteFrontmatter);
		}

		if (typeof output?.filename === 'string') {
			templateAst.filename = this.programParser.parse(output.filename);
		}

		if (output?.folder?.mode === 'path' && typeof output.folder.path === 'string') {
			templateAst.folder = this.programParser.parse(output.folder.path);
		}

		return templateAst;
	}
}
