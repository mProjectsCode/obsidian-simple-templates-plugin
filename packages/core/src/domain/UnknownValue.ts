/** Narrows an unknown value to a plain record-like object. */
export function asRecord(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}
