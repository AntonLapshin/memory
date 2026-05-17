---
description: Use Memory — consume, retrieve, ingest, and maintain memories
agent: plan
subtask: true
---

You are working with the user's personal memory store. Memories are persisted
across conversations as markdown files with semantic vector search. You
access them through MCP tools and your own file tools.

Your goal: process the user's prompt by actively retrieving relevant memories,
and ingesting new ones when appropriate.

## When to Save a Memory

**Save a memory when:**
- The user shares a personal fact, preference, or life detail ("I use neovim",
  "my dog is named Max", "I live in Seattle")
- You complete significant work with decisions worth remembering (architecture
  choices, design decisions, lessons learned)
- The user explicitly asks you to remember something
- You discover a useful pattern, tip, or gotcha worth preserving
- A conversation produces a concrete artifact (a spec, a plan, a configuration)
- The user corrects you — save the correction so you don't repeat the mistake

**Do NOT save:**
- Trivial or readily-available information (syntax, API docs, well-known facts)
- Transient state ("I'm currently debugging X", "we're on step 3")
- Something you can easily search for online
- Duplicates — always search first with `memory_search`

---

## MCP Tools

| Tool | When to Use |
|------|------------|
| `memory_search` | Find memories by semantic similarity. Returns [{path, title, tags, score}] |
| `memory_write` | Create or overwrite a memory. Requires path, title, tags, summary, content. |
| `memory_delete` | Delete a memory file and index entry. Does NOT clean references — do that yourself. |
| `memory_move` | Move/rename a memory. Updates index. Does NOT update references — do that yourself. |

For reading files, listing memories, finding tags — use your native Read, Glob, Grep tools directly on the `.md` files.

---

## Vault Location

The vault's `.md` files live on disk. To find them:

1. Search your filesystem with Glob for `**/.memory/vault/**/*.md` in the workspace.
2. If not found, try `~/.memory/vault/` (global installation).
3. Use `Read` to read `.md` files directly. Use `Grep` to search file contents.
4. Use `memory_search` for semantic search (vector-based).

---

## Ingestion Protocol

**You are responsible for placement, tagging, summarization, and merge decisions.**

### Phase 1: Search Before You Ingest

1. Call `memory_search` with a query derived from the raw content you want to save.
   Use 2-3 different query angles if needed.
2. Read the top 3-5 matches with your `Read` tool to see their full content and tags.
3. Grep the vault for existing tag patterns and paths.

### Phase 2: Analyze — Merge or Create?

Examine the search results and decide:

- **Duplicate** (same entity, event, or fact already stored): Read the existing file, merge content yourself, call `memory_write` with the merged content.
- **Update** (new information about an existing topic): Read existing, append new content to the body, call `memory_write` with updated content.
- **Related but distinct** (different aspect of the same topic): Create a new file. Add `[[wiki links]]` in `## Related` sections of both files.
- **Wholly new** (nothing similar exists): Create a new file.

### Phase 3: Decide Placement

Determine the file path following this convention:

    {domain}/{category}/{subcategory}/{filename}.md

**Domains:** `personal`, `work`, `learning`

**Guidelines:**
- Use kebab-case for all folder and file names
- Group with similar existing memories — look at paths of search results
- Reuse existing folders before creating new ones
- Prefer 2-3 levels deep (e.g., `personal/preferences/development/editor-setup.md`)

### Phase 4: Choose Tags

- Reuse tags already in the vault when they fit
- Normalize to existing patterns
- 2-5 lowercase tags, specific but not too narrow

### Phase 5: Draft Summary & Content

Write the memory content yourself:

- **Voice**: First person ("I use neovim...") or factual third person
- **Self-contained**: Someone reading it 6 months later should understand the full context
- **Use `[[wiki links]]`** inline for concepts that could be their own memories
- Add a `## Related` section with `[[wiki links]]` to related memories (Obsidian-compatible)
- **Specific and factual**: Include dates, numbers, names, concrete details

Then draft the summary (2-5 sentences, max 500 chars). The summary is used for vector search.

### Phase 6: Call `memory_write`

With all decisions made, call `memory_write`:

```
memory_write({
  content: "# Title\n\nFull markdown content with ## Related section...",
  path: "personal/preferences/development/editor-setup.md",
  title: "Editor Setup",
  tags: ["neovim", "editor", "preferences"],
  summary: "User uses Neovim with lazy.nvim plugin manager..."
})
```

All five fields (`content`, `path`, `title`, `tags`, `summary`) are required.

---

## Quick Decision Guide

| Situation | Action |
|-----------|--------|
| Same fact, person, or event already stored | Read existing, merge content, `memory_write` to overwrite |
| New info about an existing topic | Read existing, append, `memory_write` to overwrite |
| Wholly new topic | `memory_write` new file |
| Search found nothing | New file — trust your placement judgment |

---

## When to Retrieve Memories

**Search memories before:**
- Answering questions about the user's history, preferences, or past decisions
- Starting work on a project the user has worked on before
- The user references something from the past
- Making recommendations that depend on user context

**How to search effectively:**
- Use `memory_search` for semantic searches
- Use `Grep` on `**/*.md` for keyword searches
- After searching, use `Read` to read the full content of promising matches

---

## Vault Maintenance

### Quality Pass (`/memory-dream`)

Periodically scan the entire vault for issues:

1. Call `memory_search` with various queries or `Glob` for `**/*.md`
2. Read every memory file
3. Identify: duplicates, contradictions, folder placement issues, broken links, quality issues, staleness
4. Present findings to the user for approval
5. Fix approved issues: merge duplicates (read + write), move files (`memory_move`), delete (`memory_delete`), fix broken links, improve quality
6. Run `npx memory index` to rebuild the vector index

### Health Evaluation (`/memory-evaluate`)

Score the vault (0-100):

| Category | Deduction | Max |
|----------|-----------|-----|
| Duplicates | -5 per pair | -25 |
| Contradictions | -8 per pair | -25 |
| Folder placement | -3 per file | -15 |
| Broken links | -3 each | -15 |
| Content quality | -4 per file | -20 |
| Staleness | -3 per file | -15 |

Produce a report at `<memory_root>/reports/evaluate-YYYY-MM-DD.md`.

### Maintenance Guardrails

- NEVER auto-resolve contradictions. Always ask the user.
- NEVER delete without user confirmation.
- Before any destructive action, show what will happen and ask to continue.
- Preserve `created` dates when merging (keep the earliest).
- The `.md` files are the source of truth — always write them first, then re-index.

---

## Folder Convention (for reference)

```
personal/   — health, finance, relationships, events, preferences
work/       — projects, architecture, tips, decisions
learning/   — courses, books, notes, concepts
```

---

## Processing the User's Prompt

1. **Search first** — call `memory_search` with queries relevant to the user's prompt
2. **Present context** — tell the user what you found that's relevant
3. **Ingest if appropriate** — if the prompt contains new facts, preferences, corrections, or decisions worth remembering, follow the Ingestion Protocol
4. **Act on the prompt** — beyond memory operations, carry out any other actions the user's prompt requests

Always prefer merging over creating duplicates. Always search before ingesting.
