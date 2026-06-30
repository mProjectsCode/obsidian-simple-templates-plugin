/** Thrown when raw template content cannot be interpreted. */
export class TemplateParseError extends Error {}
/** Thrown when a template's structure or metadata is invalid. */
export class TemplateValidationError extends Error {}
/** Thrown when a variable value cannot be resolved. */
export class VariableResolutionError extends Error {}
/** Thrown when a formula expression fails to parse or evaluate. */
export class FormulaError extends Error {}
/** Thrown when a required variable has no value at render time. */
export class MissingRequiredVariableError extends Error {}
/** Thrown when the output path already exists and cannot be overwritten. */
export class FileConflictError extends Error {}
/** Thrown when the execution context is insufficient. */
export class ExecutionContextError extends Error {}
/** Thrown when frontmatter merging or editing fails. */
export class FrontmatterEditError extends Error {}
