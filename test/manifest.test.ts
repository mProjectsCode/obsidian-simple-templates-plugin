import { describe, expect, test } from 'bun:test';
import manifest from '../manifest.json';
import betaManifest from '../manifest-beta.json';
import versions from '../versions.json';

describe('plugin metadata', () => {
	test('keeps release manifests in sync', () => {
		expect(betaManifest).toEqual(manifest);
	});

	test('maps the current version to its minimum Obsidian version', () => {
		expect(versions[manifest.version as keyof typeof versions]).toBe(manifest.minAppVersion);
	});
});
