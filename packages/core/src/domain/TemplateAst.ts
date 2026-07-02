/** Source range in the original template string. End offsets are exclusive. */
export interface SourceSpan {
	start: number;
	end: number;
}

export interface TextNode extends SourceSpan {
	type: 'text';
	value: string;
}

export interface ExpressionNode extends SourceSpan {
	type: 'expression';
	expression: string;
}

export interface IfBranch {
	expression: string;
	children: readonly TemplateNode[];
}

export interface IfNode extends SourceSpan {
	type: 'if';
	branches: readonly IfBranch[];
	elseChildren: readonly TemplateNode[];
}

export interface ForNode extends SourceSpan {
	type: 'for';
	variable: string;
	expression: string;
	children: readonly TemplateNode[];
	emptyChildren: readonly TemplateNode[];
}

/** The only Markdown-adjacent syntax understood by the core engine. */
export type TemplateNode = TextNode | ExpressionNode | IfNode | ForNode;

/** A compiled template string that can be validated and rendered repeatedly. */
export interface TemplateProgram {
	type: 'program';
	nodes: readonly TemplateNode[];
	references: readonly string[];
}

/** Compiled templating sections belonging to one template file. */
export interface TemplateAst {
	type: 'template';
	body: TemplateProgram;
	noteFrontmatter?: TemplateProgram;
	filename?: TemplateProgram;
	folder?: TemplateProgram;
}

export interface RenderedTemplateAst {
	body: string;
	noteFrontmatter?: string;
	filename?: string;
	folder?: string;
}
