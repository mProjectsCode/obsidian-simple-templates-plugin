import { VariableResolutionError } from 'packages/core/src/domain/Errors';
import type { InputVariableDefinition } from 'packages/core/src/domain/Types';
import { splitAndTrim } from 'packages/core/src/domain/SourceText';

/** Provides input coercion and emptiness rules shared by validation and execution. */
export class InputValueHelper {
	coerce(name: string, definition: InputVariableDefinition, value: unknown): unknown {
		if (value === undefined || value === null || value === '') {
			return value;
		}

		switch (definition.inputType) {
			case 'number': {
				let number = typeof value === 'number' ? value : Number(value);
				if (!Number.isFinite(number)) {
					throw new VariableResolutionError(`Variable "${name}" must be a number.`);
				}
				return number;
			}
			case 'boolean':
				if (typeof value === 'boolean') {
					return value;
				}
				if (value === 'true') {
					return true;
				}
				if (value === 'false') {
					return false;
				}
				throw new VariableResolutionError(`Variable "${name}" must be true or false.`);
			case 'multiselect':
			case 'list':
				return this.coerceList(name, definition, value);
			case 'select': {
				let selected = this.scalar(value, name);
				if (!definition.options?.includes(selected)) {
					throw new VariableResolutionError(`Variable "${name}" must be one of its configured options.`);
				}
				return selected;
			}
			case 'date': {
				let date = this.scalar(value, name);
				if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
					throw new VariableResolutionError(`Variable "${name}" must be a date in YYYY-MM-DD format.`);
				}
				return date;
			}
			case 'datetime': {
				let datetime = this.scalar(value, name);
				if (Number.isNaN(Date.parse(datetime))) {
					throw new VariableResolutionError(`Variable "${name}" must be a valid date and time.`);
				}
				return datetime;
			}
			default:
				return value;
		}
	}

	isEmpty(value: unknown): boolean {
		return (
			value === undefined ||
			value === null ||
			(typeof value === 'string' && value.trim() === '') ||
			(Array.isArray(value) && value.length === 0)
		);
	}

	private coerceList(name: string, definition: InputVariableDefinition, value: unknown): unknown[] {
		let items: unknown[];
		if (Array.isArray(value)) {
			items = value;
		} else {
			items = splitAndTrim(this.scalar(value, name), /\r?\n|,/);
		}

		let hasInvalidOption = items.some(item => !definition.options?.includes(this.scalar(item, name)));
		if (definition.inputType === 'multiselect' && hasInvalidOption) {
			throw new VariableResolutionError(`Variable "${name}" contains a value outside its configured options.`);
		}

		return items;
	}

	private scalar(value: unknown, name: string): string {
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
			return value.toString();
		}
		throw new VariableResolutionError(`Variable "${name}" must be a scalar value.`);
	}
}
