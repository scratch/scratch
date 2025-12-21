---
title: Markdown Features | Scratch
description: A comprehensive showcase of all markdown features supported by Scratch
---

# Markdown Features

This page demonstrates the full range of markdown features you can use in your Scratch projects.

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Text Formatting

This is **bold text** and this is *italic text*.

You can also use __underscores for bold__ and _underscores for italic_.

Combine them for ***bold and italic*** text.

Use ~~strikethrough~~ to cross out text.

## Links

[Inline link](https://example.com)

[Link with title](https://example.com "Example Website")

[Reference-style link][reference]

[reference]: https://example.com

Autolinks: <https://example.com>

## Images

![Alt text for image](/scratch.svg "Scratch logo")

## Lists

### Unordered Lists

- Item one
- Item two
  - Nested item A
  - Nested item B
    - Deeply nested
- Item three

### Ordered Lists

1. First item
2. Second item
   1. Nested numbered item
   2. Another nested item
3. Third item

### Task Lists

- [x] Completed task
- [ ] Incomplete task
- [ ] Another task to do

## Blockquotes

> This is a blockquote.
>
> It can span multiple paragraphs.

> Nested blockquotes:
>
> > This is nested inside another blockquote.

## Code

Inline `code` looks like this.

### Fenced Code Blocks

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet('World');
```

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))
```

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
```

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

## Tables

| Feature | Supported | Notes |
|---------|:---------:|-------|
| Headers | Yes | Required |
| Alignment | Yes | Left, center, right |
| Inline formatting | Yes | **Bold**, *italic*, `code` |

### Right-Aligned Table

| Item | Quantity | Price |
|------|:--------:|------:|
| Apples | 4 | $1.00 |
| Oranges | 6 | $1.50 |
| Bananas | 3 | $0.75 |
| **Total** | **13** | **$3.25** |

## Footnotes

Here's a sentence with a footnote[^1].

And another one[^note].

[^1]: This is the first footnote.
[^note]: This is a named footnote with more content.

## Escaping Characters

Use backslashes to escape special characters:

\*Not italic\*

\`Not code\`

\# Not a heading

## HTML in Markdown

<details>
<summary>Click to expand</summary>

This content is hidden by default but can be revealed by clicking the summary.

You can include any markdown here:
- Lists
- **Formatting**
- [Links](/)

</details>

<div style="padding: 1rem; background: #f0f0f0; border-radius: 8px;">
  <strong>Custom styled box</strong>
  <p>HTML can be embedded directly in markdown for custom layouts.</p>
</div>

## Line Breaks

First line with two trailing spaces
Second line (soft break)

First line

Second line (hard break with blank line)

## Special Characters

- Em dash: —
- En dash: –
- Ellipsis: …
- Copyright: ©
- Trademark: ™
- Arrows: → ← ↑ ↓
- Math: ± × ÷ ≠ ≤ ≥

## Emoji

😊 🚀 ❤️

[Back to Home](/)
