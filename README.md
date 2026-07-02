# Simple Templates

Simple Templates creates Markdown notes from reusable, variable-driven templates. Templates stay as ordinary Markdown files in your vault, and formulas run as sandboxed expressions through the [Safe JS plugin](https://github.com/mProjectsCode/obsidian-safe-js-plugin).

Install and enable Safe JS before creating notes from templates. Simple Templates passes template variable values to Safe JS as JSON-safe expression inputs and requests no permissions.

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
        type: input
        inputType: text
        required: true
    slug:
        type: formula
        formula: title.toLowerCase().replaceAll(" ", "-")
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

Each variable has exactly one value source: `input`, `special`, or `formula`. Input variables also declare an `inputType` such as `text`, `number`, `select`, or `list`; only select inputs use `options`. Formula fields contain Safe JS expressions. Variables are evaluated in their frontmatter declaration order, so an expression can use input, special, and formula variables declared above it. Safe JS also provides its permissionless expression utilities such as `today()`, `now()`, and `duration()`.

Template tags also contain Safe JS expressions:

```text
{{ title.toUpperCase() }}
{{ tasks.filter(task => task.status == "done").map(task => task.name).join(", ") }}

{{#if date == today() && status == "done"}}
Done
{{else if status == "blocked"}}
Blocked
{{else}}
Not done
{{/if}}

{{#for task in tasks}}
- {{ task.name }}
{{empty}}
No tasks
{{/for}}
```

An `if` may contain any number of `{{else if expression}}` branches followed by an optional `{{else}}`. Use `{{else}}` or `{{empty}}` for a `for` fallback. Arrays are iterated directly. An empty string, `false`, `null`, or missing value is empty; any other non-array value is treated as a one-item list. Empty strings and arrays are also false in an `if`.

Because `}}` closes a template tag, escape JavaScript braces inside expressions as `\{` and `\}`. The escapes are removed before evaluation. For example: `{{ (\{ status: "done" \}).status }}`.

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
