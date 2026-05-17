---
description: Memory Dream — scan, refine, and fix memory vault issues
agent: plan
subtask: true
---

You are maintaining and improving the quality of the user's memory vault.
You have access to the vault files on disk and MCP tools.

Your goal: scan the vault for issues, present them to the user, and fix approved ones.

## Vault Location

The vault's `.md` files live at:

```
{{VAULT_PATH}}
```

Use `Read` to read `.md` files directly. Use `Grep` to search file contents.

---

## Quality Pass Process

### Step 1: Full Vault Scan

1. Use `Glob` to list all `{{VAULT_PATH}}/**/*.md` memory files.
2. For each file, use `Read` to get the full content (title, tags, summary, body, wiki links, dates).
3. Build a mental map: which domains exist, what topics are covered, which files reference each other.

### Step 2: Identify Issues

Scan for these specific problems:

#### Duplicates
- Two or more files covering exactly the same fact, entity, or event.
- Compare content side-by-side with `Read`.
- Mark the newer file as the duplicate.

#### Contradictions
- Two memories that directly conflict on the same fact.
- Examples: "I use neovim" vs "I use VSCode", "Project uses React 18" vs "Project uses React 19".
- Mark both files — user must decide which is correct.

#### Folder Placement Issues
- Memory in wrong domain (e.g., work project under `personal/`).
- Too deep nesting (4+ levels deep).
- Poorly named folders or files (not kebab-case, too vague).
- Single-file folders that could be merged into parent.

#### Broken Wiki Links
- `[[some-file]]` that does not exist anywhere in `{{VAULT_PATH}}`.
- Links to files that have been moved or deleted.
- Misspelled link targets.

#### Content Quality
- Memories with empty or missing summaries (check frontmatter).
- Summaries over 500 chars.
- Memories that are a single sentence with no useful content.
- Missing `## Related` sections where references would be useful.
- Missing frontmatter fields (title, tags, created, modified).
- Tags that don't follow vault conventions.

#### Staleness
- Memories referencing specific versions, years, dates that are now outdated.
- Memories with `modified` dates older than 6 months that contain "current", "now", "today".
- Configuration files or preferences that may have changed.

### Step 3: Present Findings to User

Show a structured summary of all issues found:

```
## Vault Scan Results

Found XX memories in {{VAULT_PATH}}.

### Issues Summary
- N duplicate pairs
- N contradictions
- N folder placement issues
- N broken links
- N quality issues
- N stale memories

### Details

#### Duplicate: "topic-a.md" ↔ "topic-a-2.md"
Both describe the same X. Recommend merging into "topic-a.md"
and deleting "topic-a-2.md". Accept?

#### Broken Link: "file.md" → [[missing-file]]
Target does not exist in vault. Fix or remove link?
...
```

**Ask for approval before making ANY changes.** Do not modify, delete, or move files until the user confirms.

### Step 4: Fix Approved Issues

For each approved fix:

- **Merge duplicates**: Read both files, combine content into the best-written one, then `memory_write` to save it. Use `memory_delete` on the duplicate.
- **Move files**: Use `memory_move` to relocate files to correct folders. Update any `[[wiki links]]` that pointed to the old path.
- **Fix broken links**: Find the correct target file, or remove the dead link if no target exists.
- **Improve quality**: Edit the `.md` file with `Read` + `Edit` or `memory_write` to add missing summaries, trim long ones, add frontmatter fields, etc.
- **Update stale content**: Edit the file to remove or update outdated information. Update `modified` date.

### Step 5: Rebuild Index

After all fixes are applied:

1. Run `npx memory index` to rebuild the vector index.
2. Verify with a quick `memory_search` that search still works.

---

## Maintenance Guardrails

- NEVER auto-resolve contradictions. Always ask the user.
- NEVER delete without user confirmation.
- Before any destructive action, show what will happen and ask to continue.
- Preserve `created` dates when merging (keep the earliest).
- The `.md` files are the source of truth — always write them first, then re-index.
- After moving files, update all `[[wiki links]]` that pointed to the old path.
