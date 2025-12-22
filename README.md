<p align="center">
  <img src="./assets/scratch-logo.svg" alt="Scratch" height="120" />
  <br />
  Make beautiful websites with Markdown and React
</p>

## Quick Start

```bash
# Install scratch
curl -fsSL https://scratch.dev/install.sh | bash

# Create a new project
scratch create

# Start the dev server
scratch dev
```

## Why Scratch?

Scratch was designed for **collaborative writing with coding agents** like [Claude Code](https://www.claude.com/product/claude-code). Use your favorite editor to write in [Markdown](https://daringfireball.net/projects/markdown/) and embed React components when it's easier to express yourself with code.

Scratch uses an opinionated project structure and requires **no boilerplate or configuration**: just create a project, run the dev server with `scratch dev`, and start writing.

When you're ready, `scratch build` your project into a static website that can be hosted anywhere.

## No Boilerplate

Scratch uses an opinionated project structure to avoid the need for boilerplate and configuration. A simple Scratch project (created with `scratch create`) looks like this:

```
    mysite/
    ├── pages/
    │   ├── index.mdx
    │   ├── Counter.tsx
    │   └── examples/
    │       ├── index.md
    │       ├── markdown.md
    │       ├── todolist-spec.mdx
    │       └── TodoList.tsx
    └── public/
        ├── logo.png
        └── favicon.svg
```

Use `scratch build` to compile this project into a [static website](https://scratch.dev/template).

Borrowing heavily from [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography), Scratch uses default styles and Markdown components to render your prose with a clean aesthetic. Code blocks use syntax highlighting by [Shiki](https://shiki.style/).

You can change styles and customize the page wrapper component by including the `src/` directory when you run `scratch create`:

```
    mysite/
    ├── pages/
    ├── public/
    └── src/
        ├── markdown/
        ├── PageWrapper.tsx
        └── tailwind.css
```

Component files and js/ts libraries can live anywhere in `pages/` and `src/`. They are auto-detected by Scratch and don't need to be explicitly imported in your .mdx files as long as the filename matches the component name.

Scratch installs build dependencies automatically. You can add additional third-party dependencies by including a `package.json` file in your project root.

## Built on Bun

Scratch is built on [Bun](https://bun.com/) for lightning-fast builds, development with HMR, and native typescript support. It uses the [Tailwind CSS](https://tailwindcss.com/) framework to make component styling easy. 

Scratch compiles Javascript (.js), Typescript (.ts), JSX (.jsx), TSX (.tsx), Markdown (.md), and MDX (.mdx).

## Commands

```bash
# Create a new project
scratch create my-site    # interactive
scratch create --minimal  # omit src/ and page examples
scratch create --full     # include src/, examples, and package.json

# Start dev server with hot module reloading
scratch dev

# Build for production
scratch build
scratch build --ssg false    # disable static site generation
scratch build --development  # unminified, with source maps

# Preview production build locally
scratch preview

# Remove build artifacts
scratch clean

# Update scratch to latest version
scratch update
```

## License

MIT
