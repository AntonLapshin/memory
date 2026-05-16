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
  deleteMemory,
  clearCollection,
  rebuildIndex,
} from './src/qdrant.js';
import {
  readMemoryFile,
  writeMemoryFile,
  mergeMemoryFile,
  addRelatedLink,
  removeRelatedLink,
  findReferencingFiles,
  replaceAllReferences,
  deleteMemoryFile,
  getAbsolutePath,
} from './src/memory-file.js';
import { summarizeForMemory, shouldCrossLink } from './src/llm.js';
import { getAllMemoryFiles, loadConfig, getVaultRoot } from './src/config.js';
import { commit } from './src/git.js';
import { configureLogger, logger } from './src/logger.js';
import type { SearchResult, MemoryFile } from './src/types.js';

async function main(): Promise<void> {
  // Initialize logger
  try {
    const cfg = loadConfig();
    configureLogger(cfg.logging);
  } catch {
    // config might not be initialized yet
  }
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
          'Save a new memory to your personal memory store. For best quality, follow the Smart Ingestion Protocol: search for related memories, read them, decide on placement/merge/tags/summary, then provide path, title, tags, and summary explicitly. When those fields are all provided, LLM summarization is skipped entirely. Use merge_with to append new information to an existing memory instead of creating a duplicate.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description:
                'Memory content in markdown. Write in first person or factual third person. Use [[wiki links]] for related concepts. Keep it self-contained — someone reading it 6 months later should understand the context.',
            },
            title: {
              type: 'string',
              description:
                'A concise title (1-8 words). Provide when the agent has determined the title; otherwise the LLM will generate one.',
            },
            path: {
              type: 'string',
              description:
                'Exact file path relative to vault root, e.g. "personal/preferences/development/editor-setup.md". Use kebab-case, follow folder conventions (personal/, work/, learning/). Provide when the agent has determined the placement; otherwise the LLM will determine it.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                '2-5 lowercase tags (e.g. ["neovim", "editor", "preferences"]). Provide when the agent has determined the tags; otherwise the LLM will generate them. Reuse existing tags when possible — check memory_list_tags first.',
            },
            summary: {
              type: 'string',
              description:
                'A 2-5 sentence summary (max 500 chars) capturing the key facts. Provide when the agent has crafted the summary; otherwise the LLM will generate one.',
            },
            merge_with: {
              type: 'string',
              description:
                'Path of an existing memory file to merge this content INTO (appends with "## Updated (YYYY-MM-DD)" separator). Use when the new information is an update or addition to an existing memory rather than a new topic. Tags will be combined, created date preserved, summary optionally updated. When set, path is ignored.',
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
      {
        name: 'memory_list_all',
        description:
          'List ALL memory files in the vault with their metadata (path, title, summary, tags, created, modified). Use this to get a complete inventory of stored memories before analysis or cleanup operations.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'memory_delete',
        description:
          'Delete a memory file and its Qdrant index entry. Automatically removes references to the deleted memory from ## Related sections in other files. Use this for removing false, outdated, or duplicate memories.',
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
          'Move/rename a memory file to a new path. Automatically updates ALL references ([[wiki links]] and ## Related entries) across the entire vault to point to the new path. Re-indexes the memory in Qdrant.',
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
      {
        name: 'memory_clear_collection',
        description:
          'Clear the entire Qdrant vector collection and recreate it. Use this before a full re-index when bulk changes have been made to memory files.',
        inputSchema: {
          type: 'object',
          properties: {},
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
                    absolute_path: getAbsolutePath(memory.path),
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

          const agentProvidedPath = (args.path as string) || '';
          const agentProvidedTitle = (args.title as string) || '';
          const agentProvidedTags = (args.tags as string[]) || [];
          const agentProvidedSummary = (args.summary as string) || '';
          const mergeWith = (args.merge_with as string) || '';

          const hasFullAgentInput =
            agentProvidedPath &&
            agentProvidedTitle &&
            agentProvidedTags.length > 0 &&
            agentProvidedSummary;

          let title: string;
          let suggestedPath: string;
          let tags: string[];
          let summaryText: string;
          let content: string;

          if (hasFullAgentInput) {
            title = agentProvidedTitle;
            suggestedPath = agentProvidedPath;
            tags = agentProvidedTags;
            summaryText = agentProvidedSummary;
            content = rawText;
            logger.info('Using agent-provided metadata, skipping LLM', {
              path: suggestedPath,
              title,
            });
          } else {
            const existingFiles = getAllMemoryFiles();
            const folderTree = buildFolderTree(existingFiles);
            const llmResult = await summarizeForMemory(rawText, folderTree);

            title = agentProvidedTitle || llmResult.title;
            suggestedPath = agentProvidedPath || llmResult.suggested_path;
            tags = agentProvidedTags.length > 0
              ? agentProvidedTags
              : llmResult.tags;
            summaryText = agentProvidedSummary || llmResult.summary;
            content = llmResult.content;
          }

          let memory: MemoryFile;
          if (mergeWith) {
            memory = mergeMemoryFile(mergeWith, {
              title,
              summary: summaryText,
              tags,
              content,
            });
          } else {
            memory = writeMemoryFile(suggestedPath, {
              title,
              summary: summaryText,
              tags,
              content,
            });
          }

          const relatedSearches = await searchMemories(memory.summary, {
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
              memory.summary,
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

        case 'memory_list_all': {
          const files = getAllMemoryFiles();
          const memories = [];
          for (const file of files) {
            const mem = readMemoryFile(file);
            if (mem) {
              memories.push({
                path: mem.path,
                absolute_path: getAbsolutePath(mem.path),
                title: mem.title,
                summary: mem.summary,
                tags: mem.tags,
                created: mem.created,
                modified: mem.modified,
              });
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: memories.length,
                    vault_root: getVaultRoot(),
                    memories,
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

          const referencingFiles = findReferencingFiles(targetPath);
          for (const refFile of referencingFiles) {
            removeRelatedLink(refFile, targetPath);
          }

          await deleteMemory(targetPath);
          deleteMemoryFile(targetPath);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    deleted: targetPath,
                    title: memory.title,
                    cleaned_references_from: referencingFiles,
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
            relatedSection: memory.raw.match(
              /## Related\s*\n(?:<!--[^>]*-->\s*\n)?([\s\S]*?)(?=\n## |\n---|$)/,
            )?.[1]?.trim() || '',
          });

          const filesChanged = replaceAllReferences(oldPath, newPathStr);

          deleteMemoryFile(oldPath);
          await deleteMemory(oldPath);

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
                    references_updated_in: filesChanged,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'memory_clear_collection': {
          await clearCollection();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'Qdrant collection cleared and recreated.',
                  collection: loadConfig().qdrant.collection,
                }),
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
    const parts = file.replace(/\\/g, '/').split('/');
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
