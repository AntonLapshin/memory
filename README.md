# 🧠 Memory

> Personal knowledge store for AI agents — persistent, searchable, self-organizing.

Memory stores facts, decisions, preferences, and lessons as Markdown files in a hierarchical folder structure. It uses Qdrant for vector search and an LLM for automatic summarization, tagging, folder placement, and cross-referencing. Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Architecture

```
AI Agent (guided by AGENTS.md or claude.md)
    │  MCP Protocol (stdio)
    ▼
MCP Server (thin wrapper)
    │  Node.js API
    ▼
Memory CLI  ─── Qdrant (vector search)
    │            Ollama (LLM + embeddings)
    │            Git (version control)
    ▼
~/.memory/**/*.md  (source of truth)
```

## Requirements

- **Node.js** >= 18
- **Ollama** running with models pulled:
  ```bash
  ollama pull gemma4:e2b
  ollama pull nomic-embed-text
  ```
- **Qdrant** (via Docker):
  ```bash
  docker run -p 6333:6333 qdrant/qdrant
  ```

## Quick Start

### Installation

```bash
git clone https://github.com/AntonLapshin/memory.git
cd memory
npm i
npm run build
npm i -g # makes `memory` available globally
```

### Initialize

```bash
memory init # local installation in the current directory (for project-specific memories)
```

or

```bash
memory init -g # global installation in the root directory ~/.memory to have shared memories across all projects
```

Interactive wizard asks for:
- GitHub repo URL (optional — local-only is fine)
- Qdrant URL (default: `http://localhost:6333`) Dashboard is available at `http://localhost:6333/dashboard`
- Ollama URLs and model names for LLM + embeddings

Creates `~/.memory/` with the following structure:
```
~/.memory/
├── config.json          # Tool configuration
├── .gitignore            # Ignores logs/, .obsidian/
├── vault/                # All .md memory files live here
│   ├── personal/
│   ├── work/
│   └── learning/
└── logs/                 # Daily log files (when enabled)
    └── memory-2025-01-15.log
```

### Save a Memory

**Via MCP (agent-driven, recommended for quality):**

The AI agent follows the [Smart Ingestion Protocol](AGENTS.md#smart-ingestion-protocol):
1. Searches for related/duplicate memories before creating anything
2. Decides whether to merge into an existing memory or create a new one
3. Determines the best folder path, tags, and summary
4. Calls `memory_ingest` with all decisions pre-made — the local LLM is bypassed

**Via CLI (quick capture, local LLM handles it):**

```bash
memory ingest "I use neovim with lazy.nvim and prefer the catppuccin theme"
```

The CLI still uses the local LLM for convenience. Use `--path`, `--tags`, `--title`
flags to override LLM decisions.

The tool then:
1. Summarizes the content into a concise memory
2. Chooses an appropriate folder path (when not agent-provided)
3. Assigns relevant tags
4. Formats the content with proper Markdown
5. Finds and cross-links related existing memories
6. Indexes in Qdrant for vector search
7. Commits to git

### Search Memories

```bash
memory retrieve "what editor does the user use"
```

Output:
```
Found 2 matching memories:

1. personal/preferences/development/editor-setup.md (96%)
   Editor Setup
   Uses neovim with lazy.nvim package manager...
   Tags: editor, neovim, preferences

2. personal/preferences/development/terminal-setup.md (68%)
   Terminal Setup
   Uses Windows Terminal with fish shell...
   Tags: terminal, shell, preferences
```

### Other Commands

```bash
memory status              # Show repo status, counts, tags
memory index               # Rebuild Qdrant index from .md files
memory pull                # Pull from remote, re-index
memory push                # Push local commits
memory config              # View/edit configuration
memory config --set qdrant.url=http://localhost:6334

memory export              # Export all memories to zip
memory import memories.zip # Import from zip (with merge)
```

## Vault Maintenance. Agent commands `/memory-dream` and `/memory-evaluate`

Use the `/memory-dream` agent slash command to perform a quality pass over the entire vault. It scans for:

- **Duplicates** — same fact/event stored in multiple files
- **Contradictions** — conflicting information between memories
- **Folder placement** — memories in wrong domain/category paths
- **Broken links** — `[[wiki links]]` pointing to non-existent files
- **Content quality** — missing summaries, tags, or formatting issues
- **Staleness** — outdated or superseded information

The command walks through discovery → analysis → user confirmation → execution → re-index. Run `/memory-dream` periodically to keep the vault clean and well-structured.

Use `/memory-evaluate` to get a scored health report (0-100) of the vault without making changes.
It produces a detailed markdown report at `.memory/reports/evaluate-YYYY-MM-DD.md`.
Run it before and after `/memory-dream` to measure improvement.

## Memory File Format

Each memory is a Markdown file with YAML frontmatter:

```markdown
---
title: "Editor Setup"
created: "2025-01-15T10:30:00Z"
modified: "2025-01-16T14:22:00Z"
tags: [editor, neovim, preferences]
summary: "Uses neovim with lazy.nvim. Theme is catppuccin..."
---

# Editor Setup

Uses [[neovim]] with the [[lazy.nvim]] plugin manager.
Preferred theme is [[catppuccin]]. Key plugins include
[[telescope]], [[nvim-treesitter]], and [[which-key]].

## Related
<!-- Auto-generated by memory tool. Do not edit manually. -->
- [[Terminal Setup]]
- [[Dotfiles Management]]
```

- `summary` field is used for Qdrant vector embedding (≤500 chars)
- `## Related` section is auto-maintained by the tool during cross-referencing
- `[[wiki links]]` in the body can be added manually for conceptual references

## MCP Server

The MCP server exposes 9 tools to AI agents:

| Tool | Description |
|------|------------|
| `memory_search` | Semantic vector search with tag filtering |
| `memory_get` | Read full content of a specific memory |
| `memory_ingest` | Save new memory or update existing via `merge_with`. Agent provides `path`, `title`, `tags`, `summary` for best quality; local LLM is used as fallback. |
| `memory_list_tags` | List all unique tags in the store |
| `memory_list_recent` | Show recently modified memories |
| `memory_list_all` | List all memories with full metadata |
| `memory_delete` | Delete a memory (auto-cleans references in other files) |
| `memory_move` | Move/rename a memory (auto-updates all references) |
| `memory_clear_collection` | Wipe and recreate the Qdrant index |

## Folder Convention

Memories are organized from abstract to concrete:

```
personal/
  health/
  finance/
    tax/
      2022/
        tax-return.md
  relationships/
    alice/
  preferences/
    development/
      editor-setup.md

work/
  project-x/
    architecture/
      design-decisions.md
    tips/
      debugging-tips.md

learning/
  courses/
  books/
  notes/
```

The agent determines the exact path during ingestion following the Smart Ingestion
Protocol (see AGENTS.md). The folder structure grows organically as new topics are introduced.

## How It Works

### Ingestion Flow

**Agent-driven path (recommended):**

1. **Search** — Agent searches for related/duplicate memories before ingesting
2. **Analyze** — Agent decides: merge into existing, create new, or restructure
3. **Draft** — Agent writes markdown content, summary, and chooses path/tags
4. **Ingest** — `memory_ingest` with all parameters explicitly provided (LLM bypassed)
5. **Cross-referencing** — Vector search for related memories → LLM decides which to link → bidirectional `## Related` updates
6. **Index** — Upsert into Qdrant with summary embedding
7. **Commit** — Git add + commit (local only)

**CLI path (local LLM fallback):**

1. **Summarize** — LLM call: raw text → `{ title, summary, path, tags, content }`
2. **Duplicate check** — Embed summary, search Qdrant for near-duplicates (0.95 threshold)
3. **File creation** — Write `.md` file with frontmatter at the suggested path
4-7 — Same cross-referencing, indexing, and commit steps as above

### Retrieval Flow

1. **Embed query** — Same embedding model
2. **Vector search** — Qdrant cosine similarity
3. **Display** — Ranked results with scores, summaries, and tags

### Persistence

- **Source of truth**: `.md` files in git (`~/.memory/vault/`)
- **Qdrant**: Derived index, fully rebuildable via `memory index`
- **Dimension auto-detection**: Embedding dimensions are detected automatically and the Qdrant collection is recreated if they change
- **No snapshots in git** — each `.md` stores its own summary in frontmatter
- **Logging**: All operations are logged to `~/.memory/logs/memory-YYYY-MM-DD.log` when enabled

## Configuration

View with `memory config`. Edit with `memory config --set key=value`.

```json
{
  "version": 1,
  "git": {
    "remote": "https://github.com/user/my-memories",
    "branch": "main"
  },
  "qdrant": {
    "url": "http://localhost:6333",
    "collection": "memories"
  },
  "llm": {
    "provider": "ollama",
    "model": "gemma4:e2b",
    "baseUrl": "http://localhost:11434"
  },
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  },
  "logging": {
    "enabled": true,
    "level": "info"
  }
}
```

## Development

```bash
npm install
npm run dev          # Run CLI with tsx (no build needed)
npm run mcp          # Run MCP server with tsx
npm run typecheck    # TypeScript type checking
npm run build        # Compile TypeScript to dist/
```

## License

MIT
