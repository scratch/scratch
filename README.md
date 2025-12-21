<p align="center">
  <img src="./template/public/scratch.svg" alt="Scratch" height="100" />
</p>

<h1 align="center">Scratch</h1>

<p align="center">
    Make beatiful websites with markdown and react
</p>

---

Scratch compiles MDX files into beautiful static websites. Write in Markdown, embed React components, and publish to the web.

## Quick Start

```bash
# Install scratch
[TBD]

# Create a new project
scratch create

# Start the dev server
scratch dev
```

## Why Scratch?

Scratch was designed for **collaborative writing with coding agents** like [Claude Code](https://www.claude.com/product/claude-code). Use your favorite editor to write in [Markdown](https://daringfireball.net/projects/markdown/) and embed React components when it's easier to express yourselve with code.

Scratch uses an opinionated project structure and requires **no boilerplate or configuration**: just create a project, run the dev server with `scratch dev`, and start writing. Use default styling or change the look and feel of your work with [Tailwind CSS](https://tailwindcss.com/) and custom Markdown components.

When you're ready, `scratch build` your project into a static website that can be hosted anywhere. Scratch is built on [Bun](https://bun.com/) so builds are lightning-fast and typescript works out-of-the-box.

## No Boilerplate

Scratch uses an opionated project structure to avoid the need for boilerplate and configuration. A simple Scratch project (created with `scratch create`) looks like this:

```
mysite/
├── pages/
│   ├── index.mdx
│   ├── Counter.tsx
|   └── examples/
|       ├── index.md
|       ├── markdown.md
|       ├── todolist-spec.mdx
|       └── todolist.tsx
└── public/
    ├── logo.png
    └── favicon.ico
```

Use `scratch build` to compile this project into a [static website](https://scratch.dev/template).

Borrowing heavily from [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography), Scratch uses default styles and Markdown components to render your prose with a clean aesthetic. Code blocks use syntax highlighting by [Shiki](https://shiki.style/).

You can change styles and customize the page wrapper component by including the `src/` directory when you run `scratch create`:

```
mysite/
├── pages/
│   ├── index.mdx
|   └── Counter.tsx
├── public/
|   ├── logo.png
|   └── favicon.ico
└── src/
    ├── markdown/
    ├── PageWrapper.tsx
    └── tailwind.css
```

Component files and js/ts libraries can live anywhere in `pages/` and `src/`. They are auto-detected by Scratch and don't need to be explicitly importated in your .mdx files as long as the filename matches the component name.

Scratch installs build dependencies You can add third-party dependencies by including a `package.json` file in your project root.

## Built with [Bun](https://bun.com/)

Scratch is built on [Bun](https://bun.com/) for lightning-fast builds, development with HMR, and native typescript support. It uses the [Tailwind CSS](https://tailwindcss.com/) framework to make component styling easy. 

Scratch compiles Javascript (.js), Typescript (.ts), JSX (.jsx), TSX (.tsx), Markdown (.md), and MDX (.mdx

## Commands

### `scratch create [path]`

Create a new Scratch project. When run interactively, prompts for which components to include. Use flags to skip prompts.

**Options:**
- `--src` / `--no-src` - Include or exclude the `src/` directory (default: include)
- `--examples` / `--no-examples` - Include or exclude example pages (default: include)
- `--package` / `--no-package` - Include or exclude `package.json` (default: exclude)
- `--minimal` - Shorthand for `--no-src --no-examples --no-package`
- `--full` - Shorthand for `--src --examples --package`

```bash
scratch create mysite           # Interactive prompts
scratch create mysite --full    # Include everything
scratch create mysite --minimal # Minimal project (pages only)
```

### `scratch dev`

Start the development server with hot module replacement. Watches for file changes and automatically rebuilds. Opens your browser to the local server.

```bash
scratch dev mysite
```

### `scratch build`

Build your project for production. Compiles all MDX/MD files to static HTML, bundles JavaScript, and processes Tailwind CSS.

**Options:**
- `--ssg [true/false]` - Enable static site generation to pre-render pages. (default: true)
- `--development` - Build in development mode (unminified, with source maps)

### `scratch preview`

Preview the production build locally. Serves the `dist/` directory on a local server.

```bash
scratch preview mysite
```

### `scratch clean`

Remove build artifacts (`dist/` and `.scratch-build-cache/` directories).xs

## License

MIT
