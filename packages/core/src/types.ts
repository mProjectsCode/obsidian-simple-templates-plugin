export type VariableType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'multiselect' | 'list' | 'special';

export const VARIABLE_TYPES = [
	'text',
	'textarea',
	'number',
	'boolean',
	'date',
	'datetime',
	'select',
	'multiselect',
	'list',
	'special',
] as const satisfies readonly VariableType[];

export type SpecialVariableSource =
	| 'activeFile.path'
	| 'activeFile.basename'
	| 'activeFile.folder'
	| 'activeFile.frontmatter'
	| 'activeFile.content'
	| 'cursor.line'
	| 'cursor.ch'
	| 'editor.selection'
	| 'date.today'
	| 'date.now'
	| 'clipboard';

export const SPECIAL_VARIABLE_SOURCES = [
	'activeFile.path',
	'activeFile.basename',
	'activeFile.folder',
	'activeFile.frontmatter',
	'activeFile.content',
	'cursor.line',
	'cursor.ch',
	'editor.selection',
	'date.today',
	'date.now',
	'clipboard',
] as const satisfies readonly SpecialVariableSource[];

export interface VariableDefinition {
	label?: string;
	description?: string;
	type: VariableType;
	required?: boolean;
	default?: unknown;
	formula?: string;
	source?: SpecialVariableSource;
	options?: string[];
	ask?: boolean;
}

export type OutputFolderDefinition = { mode: 'default' } | { mode: 'same-as-active-file' } | { mode: 'path'; path: string };
export type FileConflictStrategy = 'prompt' | 'append-number' | 'cancel';

export interface NoteOutputDefinition {
	folder?: OutputFolderDefinition;
	filename?: string;
	conflict?: FileConflictStrategy;
	openAfterCreate?: boolean;
}

export interface TemplateIdentity {
	id: string;
	name: string;
	description?: string;
	tags?: string[];
}

export interface TemplateMetadata {
	template: TemplateIdentity;
	variables?: Record<string, VariableDefinition>;
	output?: NoteOutputDefinition;
}

export interface TemplateDefinition extends TemplateIdentity {
	sourcePath: string;
	variables: Record<string, VariableDefinition>;
	output?: NoteOutputDefinition;
	body: string;
	outputFrontmatterTemplate?: string;
	rawFrontmatter: string | null;
	parsedFrontmatter: Record<string, unknown>;
}

export interface ExecutionContext {
	activeFilePath: string | null;
	activeFileBasename: string | null;
	activeFileFolder: string | null;
	activeFileFrontmatter: Record<string, unknown> | null;
	activeFileContent?: string;
	cursor?: { line: number; ch: number } | null;
	editorSelection?: string;
	clipboard?: string;
}

export interface ValidationIssue {
	severity: 'error' | 'warning';
	message: string;
	path?: string;
}

export interface ParseResult {
	template: TemplateDefinition | null;
	issues: ValidationIssue[];
}

export type ResolvedVariables = Record<string, unknown>;

export interface RenderedNote {
	content: string;
	folder: string;
	filename: string;
	conflict: FileConflictStrategy;
	openAfterCreate: boolean;
}
