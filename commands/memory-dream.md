---
description: Refine, restructure, merge, and clean up memories
agent: plan
subtask: true
---

You are performing a "dream" — a quality pass over the user's entire memory vault.
Your goal: refine content, restructure folders, merge duplicates, delete false/contradictory memories,
fix broken references, then re-index.

> **Note:** With smart ingestion (see Smart Ingestion Protocol), many issues
> that previously required dreaming — poor folder placement, missing tags,
> duplicate creation, inconsistent naming — are now caught at ingest time.
> Dreaming is now primarily for periodic bulk cleanup, catching contradictions
> that span multiple memories, and identifying staleness. It should be needed
> far less frequently than before.

## Vault Location

The vault's `.md` files live on disk. To find them:

1. Call `memory_list_all` — the response includes a `vault_root` field with the absolute filesystem path
   (e.g., `C:\Users\user\.memory\vault` for global, or `<workspace>\.memory\vault` for local).
2. Each memory entry includes `absolute_path` — the full filesystem path to that `.md` file.
3. Use `absolute_path` whenever you need to read or edit `.md` files directly with file tools (Read/Edit/Write).
   MCP tools like `memory_get`, `memory_move`, and `memory_delete` accept the `path` field (relative to vault root).

## Phase 1: Scan (READ-ONLY)

1. Call `memory_list_all` to get every memory with metadata.
2. Call `memory_list_tags` to see all tags in use.
3. For each memory, call `memory_get` to read the full content (including body and ## Related section).
4. Build a mental map: domains, key entities, timelines, cross-reference graph.

## Phase 2: Analyze (READ-ONLY)

Find and catalog these issue categories:

### Duplicates
- Same entity/event/fact described in 2+ files.
- Clues: similar titles, overlapping summaries (vector search helps), same `[[wiki links]]` targets.
- For each pair, identify which file to keep as primary (better content, more complete, better folder placement).

### Contradictions
- Two memories stating conflicting facts (e.g., "uses fish shell" vs "uses zsh").
- Flag for user decision. Do NOT auto-resolve contradictions.

### Folder Restructuring
- Files in wrong domain (e.g., a personal fact under `work/`).
- Deeply nested files that should be shallower, or flat files that belong in subfolders.
- Inconsistent kebab-case naming.
- Category folders with only 1 file that could merge into parent.

### Broken References
- `[[wiki links]]` pointing to files that don't exist in the vault.
- `## Related` entries pointing to deleted/moved files.
- Orphaned memories (nothing links to them, they link to nothing).
- Self-referential links in `## Related`.

### Content Quality
- Empty or very short summaries (< 20 chars).
- Missing tags entirely.
- Poor markdown formatting (missing headers, broken frontmatter).
- Memories without a `## Related` section.
- Summaries that are redundant with the title.

### Staleness
- Timelines that contradict (e.g., a memory about "current project" from 2022).
- Facts clearly superseded by newer memories.
- Memories referencing tools/versions that the user no longer uses.

## Phase 3: Propose (INTERACTIVE)

Present findings to the user as a structured plan. Format clearly:

```
📊 Vault scan complete: N memories across D domains.

⚠ Issues found:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DUPLICATES (X pairs):
  1. "Title A" at path/a.md
     "Title B" at path/b.md
     → SUGGEST: Merge into path/a.md (reason: ...)

CONTRADICTIONS (X):
  2. "Shell is zsh" (path1.md) vs "Shell is fish" (path2.md)
     → NEED INPUT: Which is correct?

FOLDER RESTRUCTURING (X):
  3. work/random-tip.md → work/tips/random-tip.md

BROKEN LINKS (X):
  4. personal/health.md references [[missing-page]]
     → REMOVE broken link

QUALITY (X):
  5. learning/react.md — no summary, no tags
     → ADD summary and tags

STALENESS (X):
  6. work/current-project.md (created 2022) — likely outdated
     → NEED INPUT: Still relevant?
```

Ask the user to approve each category:
- "Approve all duplicate merges?" (y/n)
- "For contradictions, let me ask about each..."
- "Approve all folder moves?" (y/n)
- "Fix all broken links?" (y/n)
- "Fix all quality issues?" (y/n)
- "For stale memories..."

Wait for user confirmation before proceeding to Phase 4.

## Phase 4: Execute (WRITE)

For each approved change:

### Merge
1. Read both files with `memory_get`.
2. Append secondary content into primary with `## Merged from {path}` separator.
3. Combine tags (deduplicate).
4. Keep earliest `created` date.
5. Write primary file via file edit tools (Edit/Write).
6. Delete secondary via `memory_delete` (auto-cleans references).
7. Any references that pointed to secondary are already cleaned by `memory_delete`.
8. If secondary appeared in any `## Related` section, those were cleaned.

### Move
1. Call `memory_move` with old_path and new_path.
2. All `[[wiki links]]` and `## Related` entries across vault are updated automatically.

### Fix Broken Links
1. If target exists at a different path → use `replaceAllReferences`-style edit to point to correct path, OR `memory_move` the target.
2. If target doesn't exist → remove the broken `[[link]]` from body and `## Related`.
3. If ambiguous (could refer to multiple things) → ask user.

### Fix Quality
1. Edit the `.md` file directly to improve summary, add missing tags.
2. For empty summaries: generate a new one from the content.
3. Ensure `## Related` section exists with the auto-generated comment.

### Delete False Memories
1. Call `memory_delete` — automatically handles reference cleanup.

### Normalize Tags
1. Review all tags for duplicates/variants (e.g., "neovim" vs "nvim").
2. For each normalization, update frontmatter in affected files.

## Phase 5: Re-Index

After all write operations complete:
1. Call `memory_clear_collection` to wipe Qdrant.
2. Run `npx memory index` to rebuild the index from all `.md` files.
   - For local vaults: run from the workspace root where `.memory/config.json` lives.
   - For global vaults: run from any directory (the CLI defaults to `~/.memory`).
3. Verify: run `memory_list_recent` and confirm count matches vault file count.

## Phase 6: Report

Show final summary:
```
✅ Dream complete

   Files changed:   X
   Merged:          X pairs → X files
   Moved:           X files
   Deleted:         X files
   Links fixed:     X
   Quality fixes:   X
   Tags normalized: X
   Index rebuilt:   N memories
```

## Guardrails

- NEVER auto-resolve contradictions. Always ask the user.
- NEVER delete without user confirmation (except as part of an approved merge, where `memory_delete` handles it).
- Before any destructive action, show what will happen and ask to continue.
- Preserve `created` dates on merges (keep the earliest).
- The vault `.md` files are the source of truth — always write them first, then re-index Qdrant.
- When editing `.md` files directly, preserve the YAML frontmatter structure exactly.
- After every batch of file edits, verify the files are still valid markdown with parseable frontmatter.
