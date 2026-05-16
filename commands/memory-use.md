---
description: Use Memory — consume, retrieve, and ingest memories
agent: plan
subtask: true
---

You are working with the user's personal memory store. Memories are persisted
across conversations as markdown files with vector search via Qdrant. You
access them through MCP tools.

Your goal: process the user's prompt by actively retrieving relevant memories,
and ingesting new ones when appropriate. Follow the Smart Ingestion Protocol
for all ingestion.

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

## Smart Ingestion Protocol

**You are responsible for placement, tagging, summarization, and merge
decisions.** Do NOT call `memory_ingest` with raw content and expect the tool to
figure everything out — the local LLM is small and makes poor placement/tagging
choices. Instead, follow this protocol for every ingestion.

### Phase 1: Search Before You Ingest

1. Call `memory_search` with a query derived from the raw content you want to save.
   Use 2-3 different query angles if needed.
2. Read the top 3-5 matches with `memory_get` to see their full content and tags.
3. Check `memory_list_tags` to see what tag patterns already exist in the vault.

### Phase 2: Analyze — Merge or Create?

Examine the search results and decide:

- **Duplicate** (same entity, event, or fact already stored): Do NOT create a
  new file. Use `merge_with` to append any new information (see Phase 6).
- **Update** (new information about an existing topic, but the old info is still
  relevant): Use `merge_with` to add the information to the existing file.
- **Related but distinct** (different aspect of the same topic): Create a new
  file and let cross-referencing link them.
- **Wholly new** (nothing similar exists): Create a new file.

Merge criteria:
- Same person, project, tool, or service
- Same specific topic or event with additional details
- The new information would make the existing memory more complete without
  contradicting it
- Example: User says "I switched from fish to zsh" → merge into the existing
  shell preference file (don't create a second shell preference file)

### Phase 3: Decide Placement

Determine the file path following this convention:

    {domain}/{category}/{subcategory}/{filename}.md

**Domains:** `personal`, `work`, `learning`

**Guidelines:**
- Use kebab-case for all folder and file names
- Group with similar existing memories — look at paths of search results
- Reuse existing folders before creating new ones
- Prefer 2-3 levels deep (e.g., `personal/preferences/development/editor-setup.md`)
- A single file in a category is fine — don't force subfolders unnecessarily
- Example paths:
  - `personal/preferences/development/typescript-preference.md`
  - `work/project-memory/architecture/postgresql-decision.md`
  - `learning/courses/rust-basics.md`

### Phase 4: Choose Tags

- Reuse tags already in the vault (from `memory_list_tags`) when they fit
- Normalize to existing patterns (e.g., if vault uses `neovim` not `nvim`, use `neovim`)
- 2-5 lowercase tags, specific but not too narrow
- Examples: `[typescript, preferences]`, `[postgresql, database, project-memory]`

### Phase 5: Draft Summary & Content

Write the memory content yourself:

- **Voice**: First person ("I use neovim...") or factual third person
  ("User uses neovim...") — be consistent within a memory
- **Self-contained**: Someone reading it 6 months later should understand the
  full context without needing the original conversation
- **Use `[[wiki links]]`** inline when referencing concepts that could be
  their own memories: "Uses [[TypeScript]] with [[Neovim]]"
- **Specific and factual**: Include dates, numbers, names, concrete details
- **Never edit the `## Related` section** — the tool maintains it automatically

Then draft the summary (2-5 sentences, max 500 chars). The summary is used for
vector search, so it should capture the key facts precisely.

### Phase 6: Call `memory_ingest`

With all decisions made, call `memory_ingest` providing explicit parameters:

**For a new memory:**
```
memory_ingest({
  content: "Markdown content you wrote...",
  path: "personal/preferences/development/editor-setup.md",
  title: "Editor Setup",
  tags: ["neovim", "editor", "preferences"],
  summary: "User uses Neovim with lazy.nvim plugin manager..."
})
```

**For updating an existing memory (merge):**
```
memory_ingest({
  content: "Additional markdown content to append...",
  title: "Editor Setup",        // usually same as existing
  tags: ["neovim", "editor"],   // tags to ADD (deduplicated with existing)
  summary: "Updated summary covering both old and new info...",
  merge_with: "personal/preferences/development/editor-setup.md"
})
```

When you provide `path`, `title`, `tags`, and `summary` all together, the tool
skips its local LLM entirely and uses your values directly.

### Quick Decision Guide

| Situation | Action |
|-----------|--------|
| Same fact, person, or event already stored | `merge_with` the existing file |
| New info about an existing topic | `merge_with` if it complements, new file if it's a different aspect |
| Wholly new topic | New file with explicit path and tags |
| Correction to an existing fact | `merge_with` to update, or new file if the correction has its own context |
| Search found nothing | New file — trust your placement judgment |

---

## When to Retrieve Memories

**Search memories before:**
- Answering questions about the user's history, preferences, or past decisions
- Starting work on a project the user has worked on before
- The user references something from the past ("remember when we...", "like we did before")
- Making recommendations that depend on user context
- The user asks "what do you know about me" or similar

**How to search effectively:**
- Use natural language queries — the system uses vector search, not keyword matching
- Be specific: "2022 tax return filing" not just "tax"
- After searching, use `memory_get` to read the full content of promising matches
- If a search returns nothing useful, try broader queries

## Tool Reference

| Tool | When to Use |
|------|------------|
| `memory_search` | Find memories related to a topic or question |
| `memory_get` | Read the full content of a specific memory file |
| `memory_ingest` | Save a new memory or update an existing one. Provide `path`, `title`, `tags`, `summary` explicitly for best quality. Use `merge_with` to append to an existing file. |
| `memory_list_tags` | Discover existing tags and domains before choosing tags for ingestion |
| `memory_list_recent` | Get context on recent activity |
| `memory_list_all` | Get a complete inventory of all memories for analysis |
| `memory_delete` | Remove a false, outdated, or duplicate memory (auto-cleans references) |
| `memory_move` | Move/rename a memory to a better path (auto-updates all references) |
| `memory_clear_collection` | Wipe and recreate the Qdrant index before a full re-index |

---

## Folder Convention (for reference)

The folder structure follows: `{domain}/{category}/{subcategory}/{file}.md`

- `personal/` — health, finance, relationships, events, preferences
- `work/` — projects, architecture, tips, decisions
- `learning/` — courses, books, notes, concepts

The agent determines the exact path during ingestion using the Smart Ingestion
Protocol above (not the local LLM). When extending an existing topic, reuse the
parent folder of the related memory.

---

## Processing the User's Prompt

Now process the user's prompt through the lens of everything above:

1. **Search first** — call `memory_search` with queries relevant to the user's
   prompt. Read matching memories with `memory_get`.
2. **Present context** — tell the user what you found in their memory store
   that's relevant to their request.
3. **Ingest if appropriate** — if the user's prompt contains new facts, preferences,
   corrections, or decisions worth remembering, follow the Smart Ingestion
   Protocol to save them.
4. **Act on the prompt** — beyond memory operations, carry out any other actions
   the user's prompt requests.

Always prefer `merge_with` over creating duplicates. Always search before ingesting.
