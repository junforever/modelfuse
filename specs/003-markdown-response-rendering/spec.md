# Markdown Response Rendering

## Purpose
Display model responses as formatted CommonMark in the three base response slots and the consolidator slot.

## Requirements
- Render completed response content through the existing shared response-panel path.
- Support standard Markdown: headings, emphasis, lists, links, blockquotes, inline code, and fenced code blocks.
- Do not interpret raw HTML from model output.
- Preserve plain-text rendering for non-response uses of shared history components.
- Preserve existing response states, actions, slot isolation, and collapsible history behavior.

## Acceptance Criteria
1. The same Markdown response produces equivalent semantic HTML in `base-1`, `base-2`, `base-3`, and `consolidator`.
2. Markdown markers are not shown when they represent supported formatting.
3. Raw HTML remains inert text rather than rendered markup.
4. Focused frontend tests and strict frontend typecheck pass.

## Non-goals
- GitHub Flavored Markdown extensions.
- Syntax highlighting.
- Markdown editing or preview controls.
- Backend or persistence changes.
