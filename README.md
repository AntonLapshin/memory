# 🧠 Memory

> Personal knowledge store for AI agents — persistent, searchable, self-organizing.

Memory stores facts, decisions, preferences, and lessons as Markdown files in a hierarchical folder structure. It uses **SQLite-vec** for embedded vector search (no Docker required) and Ollama for embeddings. Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Architecture

```
AI Agent (Opus 4.6 / DeepSeek V4)
    │  MCP Protocol (stdio) + native file tools (Read/Write/Edit/Glob/Grep)
    ▼
MCP Server (4 thin tools: search, write, delete, move)
    │  Node.js API
    ▼
Memory CLI  ─── SQLite-vec (embedded vector search)
    │            Ollama (embeddings only)
    │            Git (version control)
    ▼
~/.memory/vault/**/*.md  (source of truth)
```

**Key design**: The agent does all intellectual work — placement, tagging, summarization, merging, cross-referencing. The MCP server only handles filesystem writes, vector indexing, and search. No local LLM is used for content decisions.

## Requirements

- **Node.js** >= 18
- **Ollama** running with embedding model:
  ```bash
  ollama pull nomic-embed-text
  ```

No Docker needed. SQLite-vec is an embedded, in-process vector database.

## Quick Start

### Installation

```bash
git clone https://github.com/AntonLapshin/memory.git
cd memory
npm i
npm run build
npm i -g # makes `memory` and `mcp-memory` available globally
```

### Initialize

```bash
memory init    # local (.memory/ in current directory)
memory init -g # global (~/.memory/ for shared memories across projects)
```

Creates `.memory/` with:
```
.memory/
├── config.json
├── memory.db          # SQLite-vec vector database
├── .gitignore
├── vault/             # All .md memory files
│   ├── personal/
│   ├── work/
│   └── learning/
└── logs/
```

### Save a Memory

**Via MCP (agent-driven — recommended):**

The agent follows the Ingestion Protocol:
1. Searches for related/duplicate memories
2. Decides placement, tags, summary
3. Writes the full markdown content
4. Calls `memory_write` with all parameters

**Via CLI:**

```bash
memory ingest "content text" --path personal/preferences/editor-setup.md --title "Editor Setup" --summary "Uses Neovim..."
```

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
```

### Other Commands

```bash
memory status              # Show repo status, counts, tags
memory index               # Rebuild vector index from .md files
memory pull                # Pull from remote, re-index
memory push                # Push local commits
memory config              # View/edit configuration
memory config --set embedding.model=all-minilm

memory export              # Export all memories to zip
memory import memories.zip # Import from zip
```

## MCP Server

The MCP server exposes 4 tools:

| Tool | Description |
|------|------------|
| `memory_search` | Semantic vector search |
| `memory_write` | Create or overwrite a memory (path, title, tags, summary, content all required) |
| `memory_delete` | Delete a memory file and index entry |
| `memory_move` | Move/rename a memory |

For reading files, listing memories, finding tags — the agent uses its native Read, Glob, Grep tools directly on `.md` files.

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
Preferred theme is [[catppuccin]].

## Related
- [[Terminal Setup]]
- [[Dotfiles Management]]
```

- `summary` field is used for vector embedding (≤500 chars)
- `[[wiki links]]` are Obsidian-compatible
- `## Related` section is managed by the agent (not auto-generated)

## Agent Commands

When configured with OpenCode or Claude, the agent receives a `/memory` slash command covering:
- **Ingestion Protocol** — search → analyze → place → tag → summarize → write
- **Vault Maintenance** — quality scan, duplication detection, link validation
- **Health Evaluation** — scored report (0-100) with structured recommendations

## Configuration

```json
{
  "version": 1,
  "git": {
    "remote": "https://github.com/user/my-memories",
    "branch": "main"
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
npm run dev          # Run CLI with tsx
npm run mcp          # Run MCP server with tsx
npm run typecheck    # TypeScript type checking
npm run build        # Compile TypeScript to dist/
```

## License

MIT
