---
description: Evaluate memory vault quality with a scored report
agent: plan
subtask: true
---

You are evaluating the health of the user's memory vault.
Your goal: scan all memories, identify issues, produce a scored report in markdown.

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
3. For each memory, call `memory_get` to read the full content.
4. Build a cross-reference map: for each file, note what it links to and what links to it.

## Phase 2: Analyze (READ-ONLY)

Catalog every issue found. Use these categories and deduction rules:

### Scoring System
Start at 100 points. Deduct for each issue found. Floor at 0.
Each category also gets its own sub-score (100 = perfect).

| Category | Deduction | Max Deduction | Sub-score Weight |
|----------|-----------|---------------|------------------|
| Duplicates | -5 per pair | -25 | 25 |
| Contradictions | -8 per pair | -24 | 25 |
| Folder placement | -3 per file | -15 | 15 |
| Broken links | -3 each | -15 | 15 |
| Content quality | -4 per file | -20 | 20 |
| Staleness | -3 per file | -15 | 15 |

### Category Definitions

**Duplicates** — Two or more memories describing the same entity/event/fact.
- Clues: similar titles, overlapping summaries, same wiki link targets.
- COUNT: each pair of duplicates. (3 files on same topic = 3 pairs)

**Contradictions** — Two memories stating conflicting facts.
- Example: "uses fish shell" vs "uses zsh".
- COUNT: each conflicting pair.

**Folder placement** — Memory in wrong domain or poorly nested.
- Wrong domain (personal fact under work/).
- Too deeply nested (5+ levels) or too shallow when subfolder would be clearer.
- Inconsistent slug naming.
- COUNT: each affected file.

**Broken links** — `[[wiki links]]` or `## Related` entries pointing to non-existent files.
- Self-referential links in `## Related` also count.
- COUNT: each broken link instance.

**Content quality** — Deficiencies in memory formatting.
- Missing or very short summary (< 20 chars).
- Missing tags entirely.
- Missing `## Related` section.
- Malformed frontmatter.
- COUNT: each file with any quality issue (max 1 deduction per file).

**Staleness** — Memories that appear outdated.
- Timelines that contradict (e.g., "current project" from years ago).
- Facts clearly superseded by newer memories.
- References to tools/versions user no longer uses.
- COUNT: each affected file.

**Orphaned memories** — Informational only (no deduction).
- Files nothing links to and that link to nothing.
- Not penalized but reported.

### Compute Scores

```
total_deductions = duplicates_deductions + contradictions_deductions + folder_deductions + broken_links_deductions + quality_deductions + staleness_deductions
overall_score = max(0, 100 - total_deductions)

duplicates_score = max(0, 25 - duplicates_deductions)  // capped at 25
contradictions_score = max(0, 25 - contradictions_deductions)
folder_score = max(0, 15 - folder_deductions)
broken_links_score = max(0, 15 - broken_links_deductions)
quality_score = max(0, 20 - quality_deductions)
staleness_score = max(0, 15 - staleness_deductions)
```

### Score Interpretation

| Range | Rating | Description |
|-------|--------|-------------|
| 90-100 | Excellent | Vault is clean, well-structured, consistent |
| 75-89 | Good | Minor issues, no major problems |
| 60-74 | Fair | Several issues worth addressing |
| 40-59 | Poor | Significant cleanup recommended |
| 0-39 | Critical | Vault needs major overhaul |

## Phase 3: Produce Report (WRITE)

Create the report file at `<memory_root>/reports/evaluate-YYYY-MM-DD.md` using the current date.
`memory_root` is one level up from `vault_root` (i.e., `path.dirname(vault_root)` or strip the trailing `/vault`).
For example, if `vault_root` is `C:\Users\user\.memory\vault`, the report goes in `C:\Users\user\.memory\reports\`.
If the `reports/` directory doesn't exist, create it.

The report must follow this exact structure:

```markdown
# Memory Vault Evaluation
**Date:** YYYY-MM-DD **Memories:** N **Domains:** D

---

## Overall Score: XX/100 — RATING

| Category | Score | Issues | Deduction |
|----------|-------|--------|-----------|
| Duplicates | XX/25 | X pairs | -XX |
| Contradictions | XX/25 | X pairs | -XX |
| Folder Placement | XX/15 | X files | -XX |
| Broken Links | XX/15 | X links | -XX |
| Content Quality | XX/20 | X files | -XX |
| Staleness | XX/15 | X files | -XX |
| **Overall** | **XX/100** | **X total** | **-XX** |

*Orphaned memories: X (informational only, no deduction)*

---

## Duplicates (X pairs, -XX)
*Deduction: -5 per pair, max -25*

For each duplicate pair:
- **File A:** `path/a.md` — "Title A"
- **File B:** `path/b.md` — "Title B"
- **Overlap:** Description of why they overlap
- **Suggestion:** Merge into `path/a.md` (reason)

*(If no duplicates, write: "No duplicates found. ✅")*

---

## Contradictions (X pairs, -XX)
*Deduction: -8 per pair, max -24*

For each contradiction:
- **Memory A:** `path/a.md` — states: "fact A"
- **Memory B:** `path/b.md` — states: "fact B"
- **Resolution needed:** Ask user which is correct

*(If no contradictions, write: "No contradictions found. ✅")*

---

## Folder Placement (X files, -XX)
*Deduction: -3 per file, max -15*

For each misplaced file:
- `current/path.md` → `suggested/path.md`
- **Reason:** Why the move is suggested

*(If no issues, write: "All memories are well-placed. ✅")*

---

## Broken Links (X links, -XX)
*Deduction: -3 per link, max -15*

For each broken link:
- In `path/to/file.md`: `[[broken-target]]` → target not found
- **Action:** Remove link / point to `correct-target.md`

*(If no broken links, write: "All links are valid. ✅")*

---

## Content Quality (X files, -XX)
*Deduction: -4 per file, max -20*

For each file with quality issues:
- `path/to/file.md` — [missing summary / missing tags / no ## Related / other]
- **Fix:** Generate summary / add tags: [suggestion] / add ## Related section

*(If all files have good quality, write: "All memories have complete metadata. ✅")*

---

## Staleness (X files, -XX)
*Deduction: -3 per file, max -15*

For each stale memory:
- `path/to/file.md` — "Title" (created: YYYY-MM-DD)
- **Reason:** Why it seems outdated
- **Action:** Review with user / archive / update

*(If no stale memories, write: "All memories appear current. ✅")*

---

## Orphaned Memories (X)
*Informational only — no deduction*

For each orphan:
- `path/to/file.md` — "Title"
- Linked to by: (none)
- Links to: (none)
- **Note:** Consider linking to related memories or evaluating relevance.

*(If no orphans, write: "All memories are connected. ✅")*

---

## Recommendations

1. **Immediate:** Critical fixes (contradictions, high-impact duplicates)
2. **Short-term:** Folder restructuring, broken links, quality fixes
3. **Long-term:** Regular `/memory-dream` runs, tag normalization

---

*Report generated by `/memory-evaluate`. Run `/memory-dream` to fix issues.*
```

## Phase 4: Present to User

Show the score prominently and offer:
- "View full report: <memory_root>/reports/evaluate-YYYY-MM-DD.md"
- "Run `/memory-dream` to fix these issues?"
- "Any questions about specific findings?"

## Guardrails

- Be honest in scoring — don't inflate or deflate scores.
- All deductions must be traceable to specific files.
- If a file has multiple quality issues, only deduct once (max 1 deduction per file per category).
- For stale memories, use judgment: a 2-year-old memory about a stable fact (e.g., birthplace) is NOT stale. A 2-year-old memory about "current setup" IS.
- Duplicate detection: require substantive overlap, not just same domain. Two memories both mentioning "neovim" isn't a duplicate unless they cover the same specific information.
- Count contradictions only when facts directly conflict, not just differ in specificity.
- Keep the report file clean and well-formatted markdown.
