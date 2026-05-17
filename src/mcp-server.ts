#!/usr/bin/env node
/**
 * MCP Server — Exposes memory tools to AI agents via the Model Context Protocol (stdio).
 * The agent does all intellectual work (placement, tagging, summarization, merging).
 * The MCP server only handles filesystem write, vector indexing, and search.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  searchMemories,
  upsertMemory,
  deleteMemory as deleteVectorMemory,
} from './vector-db.js';
import {
  readMemoryFile,
  writeMemoryFile,
  deleteMemoryFile,
  getAbsolutePath,
} from './memory-file.js';
import { loadConfig } from './config.js';
import { commit } from './git.js';
import { configureLogger, logger } from './logger.js';
import type { SearchResult, MemoryFile } from './types.js';

async function main(): Promise<void> {
  try {
    const cfg = loadConfig();
    configureLogger(cfg.logging);
  } catch {
    // config might not be initialized yet
  }

  const server = new Server(
    {
      name: 'memory-mcp',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'memory_search',
        description:
          'Search your personal memory store by semantic similarity. Returns matching memory files with summaries and relevance scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 5)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'memory_write',
        description:
          'Write a memory to the store. You MUST provide path, title, tags, and summary — all are required. The content should be full markdown including any ## Related section you want. To update an existing memory, read it first, merge the content yourself, then call memory_write with the same path to overwrite.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description:
                'Full markdown content including any ## Related section. Write in first person or factual third person. Use [[wiki links]] for related concepts.',
            },
            path: {
              type: 'string',
              description:
                'File path relative to vault root, e.g. "personal/preferences/development/editor-setup.md". Use kebab-case.',
            },
            title: {
              type: 'string',
              description: 'A concise title (1-8 words).',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '2-5 lowercase tags (e.g. ["neovim", "editor", "preferences"]).',
            },
            summary: {
              type: 'string',
              description: 'A 2-5 sentence summary (max 500 chars).',
            },
          },
          required: ['content', 'path', 'title', 'tags', 'summary'],
        },
      },
      {
        name: 'memory_delete',
        description:
          'Delete a memory file and its vector index entry. Does NOT clean references in other files — you must find and update any [[wiki links]] or ## Related references yourself before or after deletion.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the memory file to delete, e.g. "personal/old-note.md"',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'memory_move',
        description:
          'Move/rename a memory file to a new path. Updates the vector index. Does NOT update references in other files — you must find and update any [[wiki links]] pointing to the old path yourself.',
        inputSchema: {
          type: 'object',
          properties: {
            old_path: {
              type: 'string',
              description: 'Current path of the memory file',
            },
            new_path: {
              type: 'string',
              description: 'New path for the memory file (including .md extension)',
            },
          },
          required: ['old_path', 'new_path'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'memory_search': {
          const results = await searchMemories(args.query as string, {
            limit: (args.limit as number) || 5,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  results.map((r: SearchResult) => ({
                    path: r.path,
                    title: r.title,
                    summary: r.summary,
                    tags: r.tags,
                    score: r.score,
                  })),
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_write': {
          const content = (args.content as string) || '';
          const filePath = (args.path as string) || '';
          const title = (args.title as string) || '';
          const tags = (args.tags as string[]) || [];
          const summary = (args.summary as string) || '';

          if (!content.trim() || !filePath || !title || !tags.length || !summary) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: content, path, title, tags, and summary are all required.',
                },
              ],
              isError: true,
            };
          }

          const memory = writeMemoryFile(filePath, {
            title,
            summary,
            tags,
            content,
          });

          await upsertMemory(memory);
          const commitHash = await commit(`memory: add "${memory.title}"`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    path: memory.path,
                    title: memory.title,
                    tags: memory.tags,
                    created: memory.created,
                    modified: memory.modified,
                    committed: commitHash ? commitHash.substring(0, 7) : null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_delete': {
          const targetPath = args.path as string;
          if (!targetPath) {
            return {
              content: [{ type: 'text', text: 'Error: "path" is required.' }],
              isError: true,
            };
          }

          const memory = readMemoryFile(targetPath);
          if (!memory) {
            return {
              content: [{ type: 'text', text: `Memory not found at path: ${targetPath}` }],
              isError: true,
            };
          }

          await deleteVectorMemory(targetPath);
          deleteMemoryFile(targetPath);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    deleted: targetPath,
                    title: memory.title,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_move': {
          const oldPath = args.old_path as string;
          const newPathStr = args.new_path as string;

          if (!oldPath || !newPathStr) {
            return {
              content: [{ type: 'text', text: 'Error: "old_path" and "new_path" are required.' }],
              isError: true,
            };
          }

          const memory = readMemoryFile(oldPath);
          if (!memory) {
            return {
              content: [{ type: 'text', text: `Memory not found at path: ${oldPath}` }],
              isError: true,
            };
          }

          if (readMemoryFile(newPathStr)) {
            return {
              content: [{ type: 'text', text: `Target path already exists: ${newPathStr}` }],
              isError: true,
            };
          }

          const moved = writeMemoryFile(newPathStr, {
            title: memory.title,
            summary: memory.summary,
            tags: memory.tags,
            content: memory.content,
          });

          deleteMemoryFile(oldPath);
          await deleteVectorMemory(oldPath);
          await upsertMemory(moved);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    moved_from: oldPath,
                    moved_to: newPathStr,
                    title: moved.title,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(e as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Memory MCP server running on stdio');
}

main().catch((e: Error) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
