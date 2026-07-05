# Simple Templates

Simple Templates creates Markdown notes from reusable, variable-driven templates. Templates stay as ordinary Markdown files in your vault, and formulas run as sandboxed expressions through the optional [Safe JS plugin](https://github.com/mProjectsCode/obsidian-safe-js-plugin).

Install and enable Safe JS when a template uses formulas or non-trivial expressions. Bare identifiers such as `{{ title }}` resolve locally and do not require Safe JS. Simple Templates passes template variable values to Safe JS as JSON-safe expression inputs and requests no permissions.

## Usage

1. Set the template folder and default output folder in **Settings → Community plugins → Simple Templates**.
2. Run **Simple Templates: Create template**, enter its identity and filename, and configure it in the metadata editor.
3. Add the template body to the created Markdown file.
4. Run **Simple Templates: Create note from template**.

The create-template command creates the configured template folder when it does not exist. Existing files are never overwritten.

The smallest useful template needs no variables or Safe JS:

```markdown
---
template:
    id: meeting-notes
    name: Meeting notes
---

# Meeting notes
```

Template variables, output paths, filename behavior, and conflict handling are configured in the template frontmatter. A `note-frontmatter` fenced block in the body becomes the created note's frontmatter; template metadata is never copied to the created note. Content before and after the fenced block remains in the note body.

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

Each variable has exactly one value source: `input`, `special`, or `formula`. Variables are evaluated in their frontmatter declaration order, so an expression can use input, special, and formula variables declared above it.

### Input variables

Input variables support these `inputType` values:

- `text` and `textarea`: String input.
- `number`: A finite number.
- `boolean`: A toggle.
- `date`: A date in `YYYY-MM-DD` format.
- `datetime`: A date and time.
- `select`: One value from the required `options` list.
- `multiselect`: One or more values from the required `options` list, entered one per line.
- `list`: A list of values entered one per line.

Set `required: true` to reject an empty value. Set `default` to prefill the input.

### Special variables

Special variables read an Obsidian value through their `source` field:

- `activeFile.path`
- `activeFile.basename`
- `activeFile.folder`
- `activeFile.frontmatter`
- `activeFile.content`
- `clipboard`

Values are loaded only when a template uses them. Clipboard access is attempted only when a template uses the `clipboard` source; if permission is unavailable, its value is empty.

### Formula variables

Formula fields contain Safe JS expressions. Safe JS also provides its permissionless expression utilities such as `today()`, `now()`, and `duration()`. Install and enable Safe JS before running a template that uses formulas or non-trivial template expressions.

### Output

The optional `output` mapping supports:

- `folder.mode`: `default`, `same-as-active-file`, or `path`. A `path` mode also requires `folder.path`, which may contain template expressions.
- `filename`: A filename template. The template name is used when omitted, and `.md` is added automatically.
- `conflict`: `prompt` (default), `append-number`, or `cancel`.
- `openAfterCreate`: Whether to open the created note. Defaults to `true`.

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

- Simple Templates: Create template
- Simple Templates: Create note from template
- Simple Templates: Edit current template metadata
- Simple Templates: Edit template metadata…
- Simple Templates: Refresh template registry
- Simple Templates: Validate templates

## Privacy and external services

Simple Templates has no telemetry, advertising, accounts, or network requests. It reads template files from the configured vault folder and writes only notes and folders explicitly requested through its commands.

Safe JS is an optional separate Obsidian plugin used for sandboxed expressions. When an expression requires Safe JS, Simple Templates sends the expression, its template source path, and JSON-safe variable values to Safe JS inside Obsidian. It requests no Safe JS permissions and sends no data to an external service.

## AI Assistance Notice

Parts of this plugin were vibe coded with AI assistance.

## Development

This project uses Bun, Vite, TypeScript, ESLint, and Prettier.

```sh
bun install
bun run dev
```

Development builds are written to `exampleVault/.obsidian/plugins/simple-templates`. Production builds are written to `dist` with `bun run build`.

## License

GPL-3.0. See [LICENSE](LICENSE).
