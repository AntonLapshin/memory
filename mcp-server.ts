#!/usr/bin/env node
/**
 * MCP Server — Thin wrapper over Memory CLI
 * Exposes memory tools to AI agents via the Model Context Protocol (stdio)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  searchMemories,
  getAllTags,
  getRecentMemories,
  upsertMemory,
} from './src/qdrant.js';
import {
  readMemoryFile,
  writeMemoryFile,
  addRelatedLink,
} from './src/memory-file.js';
import { summarizeForMemory, shouldCrossLink } from './src/llm.js';
import { getAllMemoryFiles } from './src/config.js';
import { commit } from './src/git.js';
import type { SearchResult } from './src/types.js';

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'memory-mcp',
      version: '1.0.0',
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
          'Search your personal memory store by semantic similarity. Returns matching memory files with summaries and relevance scores. Use this before answering questions about the user, past decisions, or previous work.',
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
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'memory_get',
        description:
          'Retrieve the full content of a specific memory file by its path. Use this after finding a relevant memory with memory_search to read the complete content.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the memory file, e.g. "personal/tax/2022/tax-return.md"',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'memory_ingest',
        description:
          'Save a new memory to your personal memory store. The tool will summarize the content, determine the right folder structure, find related existing memories, and add cross-links between them. Use this when the user shares important facts, preferences, decisions, or when completing significant work.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Raw text content to save as a memory',
            },
            title: {
              type: 'string',
              description:
                'Optional: specify a title (otherwise the LLM will generate one)',
            },
            path: {
              type: 'string',
              description:
                'Optional: specify an exact file path (otherwise the LLM will determine it)',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'memory_list_tags',
        description:
          'List all unique tags used across all memories. Useful for understanding what domains and categories exist.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'memory_list_recent',
        description:
          'List recently modified memories. Useful for getting context on recent activity.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum results (default: 10)',
              default: 10,
            },
          },
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
            tags: args.tags as string[] | undefined,
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
                    score: Math.round(r.score * 100) / 100,
                  })),
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_get': {
          const memory = readMemoryFile(args.path as string);
          if (!memory) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Memory not found at path: ${args.path}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    path: memory.path,
                    title: memory.title,
                    summary: memory.summary,
                    tags: memory.tags,
                    created: memory.created,
                    modified: memory.modified,
                    content: memory.content,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_ingest': {
          const rawText = (args.content as string) || '';
          if (rawText.trim().length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: No content provided. The "content" field is required.',
                },
              ],
              isError: true,
            };
          }

          const existingFiles = getAllMemoryFiles();
          const folderTree = buildFolderTree(existingFiles);
          const summary = await summarizeForMemory(rawText, folderTree);

          if (args.title) summary.title = args.title as string;
          if (args.path) summary.suggested_path = args.path as string;

          const memory = writeMemoryFile(summary.suggested_path, {
            title: summary.title,
            summary: summary.summary,
            tags: summary.tags,
            content: summary.content,
          });

          const relatedSearches = await searchMemories(summary.summary, {
            limit: 5,
          });
          const relatedLinks: Array<{
            path: string;
            title: string;
            reason: string;
          }> = [];

          for (const related of relatedSearches) {
            if (related.path === memory.path) continue;
            if (related.score < 0.4) continue;

            const decision = await shouldCrossLink(
              summary.summary,
              related.summary,
              related.path,
            );

            if (decision.link) {
              addRelatedLink(memory.path, related.path, related.title);
              addRelatedLink(related.path, memory.path, memory.title);
              relatedLinks.push({
                path: related.path,
                title: related.title,
                reason: decision.reason,
              });

              const updatedRelated = readMemoryFile(related.path);
              if (updatedRelated) {
                await upsertMemory(updatedRelated);
              }
            }
          }

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
                    summary: memory.summary,
                    tags: memory.tags,
                    cross_references: relatedLinks,
                    committed: commitHash ? commitHash.substring(0, 7) : null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_list_tags': {
          const tags = await getAllTags();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ tags }, null, 2),
              },
            ],
          };
        }

        case 'memory_list_recent': {
          const recent = await getRecentMemories(
            (args.limit as number) || 10,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  recent.map((r: SearchResult) => ({
                    path: r.path,
                    title: r.title,
                    summary: r.summary?.substring(0, 200),
                    tags: r.tags,
                  })),
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

function buildFolderTree(files: string[]): string {
  if (files.length === 0) return '(empty)';

  const tree = new Map<string, unknown>();

  for (const file of files) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
      if (!current.has(parts[i])) {
        current.set(parts[i], new Map<string, unknown>());
      }
      current = current.get(parts[i]) as Map<string, unknown>;
    }
  }

  function render(node: Map<string, unknown>, depth = 0): string {
    let result = '';
    for (const [key, children] of node) {
      result += '  '.repeat(depth) + '📁 ' + key + '\n';
      if (children instanceof Map && children.size > 0 && depth < 3) {
        result += render(children, depth + 1);
      }
    }
    return result;
  }

  return render(tree);
}

main().catch((e: Error) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
