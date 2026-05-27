export function renderScratchExplainSkill(projectPath: string): string {
  return `---
name: scratch-explain
description: "Create Scratch-backed visual explainers as persistent MDX notes with reusable React components, Mermaid diagrams, syntax-highlighted snippets, code evidence, and an explicit published/unpublished flow."
---

# scratch-explain

Use this skill when the user wants a technical explanation, architecture overview, plan audit, comparison, recap, or implementation note to become a persistent Scratch page instead of only chat.

This skill is project-local. For this checkout, the Scratch project is \`${projectPath}\`.

If this still says \`{{PROJECT_PATH}}\`, edit it to the absolute path of the Scratch project that should store generated explainers.

Reasoning: this skill is often installed in a repo that is not itself the Scratch project. The explicit path prevents generated notes from being written into the wrong checkout.

BAD:
\`\`\`text
The user asks for an explainer from ~/myproject, and the note is written under ~/myproject/pages/explainers.
\`\`\`

GOOD:
\`\`\`text
Write the explainer to {{PROJECT_PATH}}/pages/explainers/<slug>.mdx after replacing {{PROJECT_PATH}} with the configured Scratch project path.
\`\`\`

## Operating Model

Primary invocations:

\`\`\`text
$scratch-explain <local-code-path>
$scratch-explain <url-or-document>
$scratch-explain how does X work?
\`\`\`

For code-aware prompts without an explicit root, inspect the current repository first, then use any user-provided context roots.

Reasoning: explainers should be grounded in real code, diffs, or source documents instead of generic summaries.

BAD:
\`\`\`text
The user asks how a queue works, and the note is written from memory.
\`\`\`

GOOD:
\`\`\`text
Search the relevant models, jobs, services, and tests before writing the note.
\`\`\`

## Output Contract

Always write the explainer source to:

\`\`\`text
{{PROJECT_PATH}}/pages/explainers/<slug>.mdx
\`\`\`

Every generated explainer starts private:

\`\`\`mdx
---
title: Clear Note Title
description: One sentence summary.
date: YYYY-MM-DD
published: false
prompt: >
  Original prompt that can regenerate this explainer.
---

{/* @scratch-explain */}
\`\`\`

Use \`published: true|false\`. Do not use \`public:\`.

Reasoning: \`published\` is the visibility key read by Scratch's explainer directory and publish pruning. A second key creates ambiguity and makes pages disappear from the index.

BAD:
\`\`\`mdx
---
title: Queue Retry Notes
public: true
---
\`\`\`

GOOD:
\`\`\`mdx
---
title: Queue Retry Notes
description: Why retry state changed.
date: 2026-05-19
published: false
---
\`\`\`

## Component-First MDX

Generated pages should compose reusable Scratch/React components before writing custom JSX or HTML. Import from \`../../src/explainers\`:

\`\`\`mdx
import {
  ExplainerPage,
  ExplainerHero,
  ExplainerMeta,
  EvidencePanel,
  DataTable,
  StatusBadge,
  MetricGrid,
  ExplainerSection,
  FileMap,
  Pipeline,
  Callout,
  RequirementMatrix,
  BeforeAfter,
  ExplainerChecklist,
  Timeline,
  DecisionRecord,
  ConceptMap,
  FlowCard,
  ComparisonGrid,
  SourceCallout,
  RiskRegister,
  StepList,
  Glossary,
  ArtifactLinks,
  Mermaid,
  SyntaxHighlighter,
} from '../../src/explainers';
\`\`\`

Use raw JSX/HTML only for genuinely one-off structure. If a visual pattern appears twice, prefer adding or extending a shared component.

Reasoning: component composition keeps generated MDX readable and lets visual fixes apply across future notes.

BAD:
\`\`\`mdx
<div className="not-prose rounded-xl border p-6">
  <div className="grid grid-cols-2 gap-4">...</div>
</div>
\`\`\`

GOOD:
\`\`\`mdx
<ExplainerPage>
  <ExplainerHero intent="system-model" title="Queue Retry Flow" summary="Retry timing moved into explicit state." />
  <BeforeAfter before="Timer callbacks own retries." after="State transitions own retries." />
</ExplainerPage>
\`\`\`

## Publish Flow

Generated explainers start with \`published: false\`. Set \`published: true\` only when the page should appear in the explainer directory and be retained by \`scratch publish\`.
`
}
