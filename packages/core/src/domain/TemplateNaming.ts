export function isValidTemplateId(value: string): boolean {
	return /^[a-zA-Z0-9_-]+$/.test(value);
}

export function isValidVariableName(value: string): boolean {
	return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}
