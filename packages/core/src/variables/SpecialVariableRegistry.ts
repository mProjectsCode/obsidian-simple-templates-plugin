export interface SpecialVariableDefinition<Environment> {
	label: string;
	/** May return either a value or a promise; the variable resolver awaits it. */
	resolve(environment: Environment): unknown;
}

/** Read-only source catalogue used while parsing and validating templates. */
export interface SpecialVariableCatalog {
	has(source: string): boolean;
}

/** Host-populated registry of environment-backed template variables. */
export class SpecialVariableRegistry<Environment> implements SpecialVariableCatalog {
	private readonly definitions = new Map<string, SpecialVariableDefinition<Environment>>();

	register(source: string, definition: SpecialVariableDefinition<Environment>): this {
		if (this.definitions.has(source)) {
			throw new Error(`Special variable source "${source}" is already registered.`);
		}
		this.definitions.set(source, definition);
		return this;
	}

	has(source: string): boolean {
		return this.definitions.has(source);
	}

	get(source: string): SpecialVariableDefinition<Environment> | undefined {
		return this.definitions.get(source);
	}

	entries(): IterableIterator<[string, SpecialVariableDefinition<Environment>]> {
		return this.definitions.entries();
	}

	[Symbol.iterator](): IterableIterator<[string, SpecialVariableDefinition<Environment>]> {
		return this.entries();
	}

	resolve(source: string, environment: Environment): unknown {
		let definition = this.definitions.get(source);
		if (!definition) {
			throw new Error(`Special variable source "${source}" is not registered.`);
		}
		return definition.resolve(environment);
	}
}
