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

# Build for production
scratch build
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

Borrowing heavily from [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography), Scratch uses default styles and Markdown components to render your prose with a clean aesthetic. Code blocks use syntax hilighting by [Shiki](https://shiki.style/).

You can change the look and feel and customize the page wrapper component by including the `src/` directory when you run `scratch create`:

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

| Command | Description |
|---------|-------------|
| `scratch init [path]` | Initialize a minimal project (flags: `--full`, `--examples`) |
| `scratch create [path]` | Create a project with interactive prompts |
| `scratch dev [path]` | Start the development server |
| `scratch build [path]` | Build for production |
| `scratch preview [path]` | Preview the production build |
| `scratch clean [path]` | Clean build artifacts |

## License

MIT
