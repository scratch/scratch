<p align="center">
  <img src="./template/public/scratch-logo.svg" alt="Scratch" height="120" />
</p>

Scratch is a tool for writing with [Markdown](https://daringfireball.net/projects/markdown/) and [React](https://react.dev/).

Scratch compiles MDX files into beautiful static websites that can be shared publicly or privately with a single command. It's opinionated about everything so that you can focus on writing without worrying about scaffolding, dependencies, formatting or styling.

Scratch was designed for collaborative writing with coding agents like [Claude Code](https://www.claude.com/product/claude-code). Use your favorite editor to write in Markdown and ask an agent for help when it's easier to express yourself with code.

## Quick Start

Scratch requires no configuration so it's easy to get started. First, install:

```bash
# Install scratch
curl -fsSL https://scratch.dev/install.sh | bash
```

Then create a project and start the dev server:

```bash
# Create a new project
scratch create

# Start the dev server
scratch dev
```

Now you're ready to start writing in `pages/index.mdx`. Use the `publish` command to share with specific people, your team, or the world:

```bash
# Publish your project to a Scratch server.
# Grant access to specific people, @youdomain.com, or the world
scratch publish
```

## What can you do with Scratch?

Scratch turns Markdown and MDX content into static websites you can share privately with your colleagues or publicly with the world.

### Formatting text

Traditional word processors like Microsoft Word and Google Docs give writers a fixed set of formatting options exposed as buttons in ribbons and drop-down menus.

In contrast, Markdown pares all of this down to the bare essentials, like `**bold**`, `_italics_`, and `[embedded hyperlinks](http://example.org)`, expressed directly in plain text.

MDX gives us a way to add an essentially infinite variety of formatting options: **use Markdown for the basics and React components for everything else**.

For example, you can create inline components for highlighting text, hover tooltips, or callout boxes that draw attention to important snippets. Scratch doesn't include any of these components out-of-the-box. Instead, you'll create them as the need arises while you write, effectively building a custom word processor for each document. It's a lot of fun!

### Interactive demos

You can also use React components to embed interactive demos into your prose—counters, todo lists, forms, or anything else you can build with React.

This is particularly handy for writing product specs where embedded demos can communicate what it should feel like to use a particular feature much better than written requirements and wireframes do.

### Publishing your work

Use the `scratch publish` command to share your writing, either privately with your colleagues or publicly with the world.

For now, you can publish your work for free on [scratch.dev](https://scratch.dev). Right now, this capability is a "preview" and shouldn't be used for anything important. Projects published on scratch.dev must be less than 5MB and will persist for only 30 days.

You can also host your own Scratch server on Cloudflare and protect it with Cloudflare Access for additional security.

## No Boilerplate

Scratch uses an opinionated project structure and requires **no boilerplate or configuration**: just create a project, run the dev server with `scratch dev`, and start writing.

A simple Scratch project (created with `scratch create`) looks like this:

```
my-scratch-project/
├── pages/                    # put markdown and components here
│   ├── index.mdx
│   └── Counter.tsx
├── public/                   # static assets
│   └── favicon.svg
├── src/                      # global components and css
│   ├── PageWrapper.jsx
│   ├── tailwind.css
│   └── markdown/
│       ├── index.ts
│       ├── CodeBlock.tsx
├── AGENTS.md
├── package.json
└── .gitignore
```

Use `scratch build` to compile this project into a static website, like [scratch.dev](https://scratch.dev).

Component files and libraries can live anywhere in `pages/` and `src/`. They are auto-detected by Scratch and don't need to be explicitly imported in your .mdx files as long as the filename matches the component name.

Modify `src/tailwind.css` to change the styling of your document. Add headers, footers and other site-wide elements by modifying `src/PageWrapper.jsx`.

## Commands

```bash
# Create a new project
scratch create [path]         # create project at path (default: current directory)

# Start dev server with hot module reloading
scratch dev

# Build for production
scratch build
scratch build --no-ssg        # disable static site generation
scratch build --development   # unminified, with source maps

# Preview production build locally
scratch preview

# Remove build artifacts
scratch clean

# Revert a file to its template version
scratch checkout [file]            # revert a file to its template version
scratch checkout --force [file]    # overwrite without confirmation
scratch checkout --list            # list available template files

# Watch markdown file(s) with live reload
scratch watch <path>              # file or directory

# Update scratch to latest version
scratch update
```

## Acknowledgements

Scratch is built on the shoulders of giants:

Scratch uses [Bun](https://bun.com/) for lightning-fast builds, development with HMR, native TypeScript support, and bundling as a portable executable.

[React](https://react.dev/) and [MDX](https://mdxjs.com/) make it possible to compile Markdown and code into static websites. [Tailwind CSS](https://tailwindcss.com/) makes them look good, and makes it easy to style custom components.

Content preprocessing relies on [unified](https://unifiedjs.com/), with [remark-gfm](https://github.com/remarkjs/remark-gfm) for GitHub Flavored Markdown and [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter) plus [gray-matter](https://github.com/jonschlinkert/gray-matter) for parsing front matter.

[Shiki](https://shiki.style/) provides syntax highlighting with VS Code's grammar engine.

[Commander.js](https://github.com/tj/commander.js) scaffolds the CLI.

Scratch server uses [hono](https://hono.dev) for routing and [Better Auth](https://better-auth.com) for authentication.

## License

MIT
