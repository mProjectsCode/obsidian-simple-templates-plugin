# Simple Templates

Simple Templates creates Markdown notes from reusable, variable-driven templates. Templates stay as ordinary Markdown files in your vault, and formulas run through a small safe engine without arbitrary JavaScript.

## Usage

1. Set the template folder and default output folder in the plugin settings.
2. Add `template.id` and `template.name` to a Markdown file's YAML frontmatter.
3. Run **Templates: Create note from template**.

Template variables, output paths, filename behavior, and conflict handling are configured in the template frontmatter. A `note-frontmatter` fenced block in the body becomes the created note's frontmatter; template metadata is never copied to the created note.

````markdown
---
template:
    id: project-note
    name: Project note
variables:
    title:
        type: text
        required: true
    slug:
        type: text
        formula: slug(title)
output:
    folder:
        mode: default
    filename: '{{ slug }}'
    conflict: append-number
---

```note-frontmatter
title: "{{ title }}"
status: active
```

# {{ title }}
````

The metadata editor commands can edit existing Markdown files in the template folder while preserving unrelated frontmatter and the Markdown body.

## Commands

- Templates: Create note from template
- Templates: Edit current template metadata
- Templates: Edit template metadata…
- Templates: Refresh template registry
- Templates: Validate templates

## Development

This project uses Bun, Vite, TypeScript, ESLint, and Prettier.

```sh
bun install
bun run dev
```

Development builds are written to `exampleVault/.obsidian/plugins/simple-templates`. Production builds are written to `dist` with `bun run build`.

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).
