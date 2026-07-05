import { errorMessage, FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/domain/Errors';
import type { ResolvedVariables, VariableDefinition } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';
import { InputValueHelper } from 'packages/core/src/variables/InputValueHelper';

/**
 * Resolves template variables through special sources, user input, Safe JS expressions,
 * defaults, type coercion, and required-value checks.
 */
export class VariableResolver<Environment> {
	private readonly inputValues = new InputValueHelper();

	constructor(
		private readonly specialVariables: SpecialVariableRegistry<Environment>,
		private readonly expressions: ExpressionEvaluator,
	) {}

	static needingInput(definitions: Record<string, VariableDefinition>): string[] {
		return Object.entries(definitions)
			.filter(([, definition]) => definition.type === 'input')
			.map(([name]) => name);
	}

	async resolve(
		definitions: Record<string, VariableDefinition>,
		environment: Environment,
		userValues: ResolvedVariables,
		sourcePath?: string,
	): Promise<ResolvedVariables> {
		let values: ResolvedVariables = {};

		// Populate values that come directly from the Obsidian environment.
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'special') {
				values[name] = await this.specialVariables.resolve(definition.source, environment);
			}
		}

		// Reject values for undeclared or non-input variables before copying them.
		for (let [name, value] of Object.entries(userValues)) {
			let definition = definitions[name];
			if (!definition) {
				throw new VariableResolutionError(`Unknown variable "${name}".`);
			}
			if (definition.type !== 'input') {
				throw new VariableResolutionError(`Variable "${name}" does not accept user input.`);
			}
			values[name] = value;
		}

		// Explicit undefined entries let formulas distinguish declared inputs from unknown names.
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'input' && !(name in values)) {
				values[name] = undefined;
			}
		}

		// Apply defaults before formula evaluation so formulas can consume them.
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'input' && values[name] === undefined && definition.default !== undefined) {
				values[name] = structuredClone(definition.default);
			}
		}

		// Coerce and validate inputs before formulas consume them.
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type !== 'input') {
				continue;
			}

			values[name] = this.inputValues.coerce(name, definition, values[name]);

			if (definition.required && this.inputValues.isEmpty(values[name])) {
				throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
			}
		}

		// Declaration order defines which earlier formula values are available.
		await this.resolveFormulas(definitions, values, sourcePath);

		return values;
	}

	private async resolveFormulas(
		definitions: Record<string, VariableDefinition>,
		values: ResolvedVariables,
		sourcePath?: string,
	): Promise<void> {
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type !== 'formula') {
				continue;
			}

			try {
				let directDependency = definitions[definition.formula];
				if (directDependency?.type === 'formula' && !Object.hasOwn(values, definition.formula)) {
					throw new Error(`Formula "${definition.formula}" has not been evaluated yet.`);
				}

				values[name] = await this.expressions.evaluateTemplateExpression(definition.formula, values, sourcePath);
			} catch (error) {
				throw new FormulaError(
					`Expression for "${name}" failed: ${errorMessage(error)} ` +
						'Formula variables can only use variables declared above them.',
				);
			}
		}
	}
}
