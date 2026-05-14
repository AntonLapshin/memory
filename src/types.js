/**
 * @typedef {Object} Config
 * @property {number} version
 * @property {GitConfig} git
 * @property {QdrantConfig} qdrant
 * @property {LlmConfig} llm
 * @property {EmbeddingConfig} embedding
 */

/**
 * @typedef {Object} GitConfig
 * @property {string} remote - GitHub repo URL
 * @property {string} branch - Branch name
 * @property {string} [tokenEnv] - Environment variable for PAT
 */

/**
 * @typedef {Object} QdrantConfig
 * @property {string} url - Qdrant server URL
 * @property {string} collection - Collection name
 */

/**
 * @typedef {Object} LlmConfig
 * @property {string} provider - 'ollama' | 'openai' | 'anthropic'
 * @property {string} model - Model name
 * @property {string} baseUrl - API base URL
 * @property {string} [apiKeyEnv] - Environment variable for API key
 */

/**
 * @typedef {Object} EmbeddingConfig
 * @property {string} provider - 'ollama' | 'openai'
 * @property {string} model - Model name
 * @property {string} baseUrl - API base URL
 * @property {number} dimensions - Embedding dimensions
 * @property {string} [apiKeyEnv] - Environment variable for API key
 */

/**
 * @typedef {Object} MemoryFile
 * @property {string} path - Relative path to .md file
 * @property {string} title - From frontmatter
 * @property {string} summary - From frontmatter, ≤500 chars
 * @property {string[]} tags - From frontmatter
 * @property {string} created - ISO 8601
 * @property {string} modified - ISO 8601
 * @property {string} content - Full markdown content (without frontmatter)
 * @property {string} raw - Raw file content
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} path - Relative path
 * @property {string} title - Memory title
 * @property {string} summary - Memory summary
 * @property {string[]} tags - Memory tags
 * @property {number} score - Similarity score
 */

/**
 * @typedef {Object} SummarizeResult
 * @property {string} title
 * @property {string} summary
 * @property {string} suggested_path
 * @property {string[]} tags
 * @property {string} content - Formatted markdown content
 */

export {};
