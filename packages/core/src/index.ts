/** Core library barrel – re-exports every public symbol so consumers can import
 *  from a single entry point. */

export * from 'packages/core/src/domain/Errors';
export * from 'packages/core/src/domain/TemplateAst';
export * from 'packages/core/src/domain/Types';
export * from 'packages/core/src/expressions/ExpressionEvaluator';
export * from 'packages/core/src/frontmatter/FrontmatterService';
export * from 'packages/core/src/output/OutputPathResolver';
export * from 'packages/core/src/templates/TemplateEngine';
export * from 'packages/core/src/templates/TemplateParser';
export * from 'packages/core/src/templates/TemplateProgramParser';
export * from 'packages/core/src/templates/TemplateRenderer';
export * from 'packages/core/src/templates/TemplateValidator';
export * from 'packages/core/src/variables/SpecialVariableRegistry';
export * from 'packages/core/src/variables/InputValueService';
export * from 'packages/core/src/variables/VariableResolver';
