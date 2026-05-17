---
description: Evaluate Memory health — score vault quality and generate a report
agent: plan
subtask: true
---

You are evaluating the health and quality of the user's memory vault.
You have access to the vault files on disk and MCP tools.

Your goal: scan the entire vault, score it, and produce a structured report.

## Vault Location

The vault's `.md` files live at:

```
{{VAULT_PATH}}
```

The reports directory is at: `{{MEMORY_ROOT}}/reports/`

---

## Health Evaluation

Score the vault (0-100) by deducting for issues found:

| Category | Deduction | Max |
|----------|-----------|-----|
| Duplicates | -5 per pair | -25 |
| Contradictions | -8 per pair | -25 |
| Folder placement | -3 per file | -15 |
| Broken links | -3 each | -15 |
| Content quality | -4 per file | -20 |
| Staleness | -3 per file | -15 |

Scoring details:
- **Duplicates**: Two or more memories covering the same entity/fact/event. Compare content side-by-side.
- **Contradictions**: Two memories that directly conflict on facts. Flag for user resolution.
- **Folder placement**: Memory placed in wrong domain (e.g., work project in `personal/`) or too deep/shallow.
- **Broken links**: `[[wiki links]]` that reference files that don't exist in the vault.
- **Content quality**: Memories that are too vague, missing dates, have poor summaries, or are single-line. Also flag summaries longer than 500 chars.
- **Staleness**: Memories not updated in 6+ months that reference dates, versions, or transient states.

## Evaluation Process

1. **Scan the vault**: Use `Glob` to list all `{{VAULT_PATH}}/**/*.md` files.
2. **Read every file**: Use `Read` to get the full content of each memory.
3. **Cross-reference**: Compare files within the same domain/folder. Look for duplicates and contradictions.
4. **Check links**: For every `[[link]]` found, check if target file exists in the vault.
5. **Assess quality**: Rate each file on clarity, completeness, and useful lifespan.
6. **Calculate score**: Apply deductions from the rubric above. Minimum score is 0.
7. **Generate report**: Write to `{{MEMORY_ROOT}}/reports/evaluate-YYYY-MM-DD.md`.

## Report Template

```markdown
# Memory Vault Evaluation — YYYY-MM-DD

## Overall Score: XX/100

### Score Breakdown

| Category | Deduction | Issues Found |
|----------|-----------|-------------|
| Duplicates | -X | N pairs |
| Contradictions | -X | N pairs |
| Folder placement | -X | N files |
| Broken links | -X | N links |
| Content quality | -X | N files |
| Staleness | -X | N files |

### Issues Found

#### Duplicates
- **file-a.md** and **file-b.md**: (describe duplicate content)
  - Recommended: merge into file-a.md, delete file-b.md
  - ⚠ User confirmation required

#### Contradictions
- **file-x.md** says X but **file-y.md** says Y
  - ⚠ User must resolve — do not auto-resolve

#### Folder Placement
- **bad/path/memory.md**: should be under personal/preferences/...
- ...

#### Broken Links
- **file.md**: [[missing-file]] → file not found
- ...

#### Content Quality
- **poor-memory.md**: (describe issue — too vague, missing summary, etc.)

#### Staleness
- **old-memory.md**: last modified 2023-01-15, references "current" React version 17
- ...

### Recommendations

(Brief overall recommendations for improving vault health.)

### Index Status

(After fixing issues, run `npx memory index` to rebuild the vector index.)
```

---

## Maintenance Guardrails

- NEVER auto-resolve contradictions. Always ask the user.
- NEVER delete without user confirmation.
- Before any destructive action, show what will happen and ask to continue.
- Preserve `created` dates when merging (keep the earliest).
- The `.md` files are the source of truth — always write them first, then re-index.
