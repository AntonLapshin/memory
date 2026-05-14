# Memory Usage Guide for AI Agents

## What This Is

Memory is a personal knowledge store that persists across conversations. It stores
facts, decisions, preferences, and lessons as markdown files with vector search.
You access it through MCP tools.

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

## How to Formulate a Memory

1. **Write in the user's voice or factual third person.**
   Good: "User's dog is Max, a 3-year-old golden retriever with chicken allergies."
   Bad: "We talked about dogs today."

2. **Keep it self-contained.** Someone reading it 6 months later should understand
   the full context without needing the original conversation.

3. **Use `[[wiki links]]` inline** when referencing related concepts that might
   become their own memories later.
   Example: "Uses [[Standard Deduction]] after comparing with [[Itemized Deductions Guide]]."

4. **Never edit the `## Related` section** at the bottom — the tool maintains this
   automatically during cross-referencing.

5. **Be specific and factual.** Include dates, numbers, names, and concrete details.

6. **Write the raw content naturally** — the tool will handle summarization,
   tagging, and folder placement automatically.

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
| `memory_ingest` | Save new facts, decisions, or knowledge |
| `memory_list_tags` | Explore available domains and categories |
| `memory_list_recent` | Get context on recent activity |

## Examples

### Example 1: User shares a preference
```
User: "By the way, I prefer TypeScript over JavaScript for all my projects."
Agent: *calls memory_ingest with content: "User prefers TypeScript over JavaScript
       for all projects. They are comfortable with strict mode and prefer explicit
       types over inference for function signatures."*
```

### Example 2: Remembering a project decision
```
User: "Let's use PostgreSQL for the new API because we need JSONB support."
Agent: *calls memory_ingest with content: "Project 'new-api' uses PostgreSQL
       as the database. Decision driven by need for JSONB support. Consider
       using [[PostgreSQL Connection Pooling]] for production."*
```

### Example 3: Retrieving context before work
```
User: "Let's continue working on the API project."
Agent: *calls memory_search with query: "API project PostgreSQL design"*
Agent: *reads top result with memory_get*
Agent: "I recall we decided on PostgreSQL for JSONB support. Should I continue with that?"
```

### Example 4: Learning from mistakes
```
User: "That last approach with polling was terrible. Let's use webhooks."
Agent: *calls memory_ingest with content: "Avoid polling-based approaches for
       real-time features. Previous polling implementation for notifications
       caused rate limiting. Use [[Webhook Pattern]] instead."*
```

### Example 5: User corrects you
```
User: "No, I use fish shell, not zsh."
Agent: *calls memory_ingest with content: "User uses fish shell, not zsh.
       Corrected from earlier assumption."*
```

## Folder Convention (for reference)

The folder structure follows: `{domain}/{category}/{subcategory}/{file}.md`

- `personal/` — health, finance, relationships, events, preferences
- `work/` — projects, architecture, tips, decisions
- `learning/` — courses, books, notes, concepts

The LLM determines the exact path automatically during ingestion
based on the content. You don't need to specify it.
