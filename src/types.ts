export interface GitConfig {
  remote: string;
  branch: string;
  tokenEnv?: string;
}

export interface QdrantConfig {
  url: string;
  collection: string;
}

export interface LlmConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  baseUrl: string;
  apiKeyEnv?: string;
}

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai';
  model: string;
  baseUrl: string;
  dimensions: number;
  apiKeyEnv?: string;
}

export interface Config {
  version: number;
  git: GitConfig;
  qdrant: QdrantConfig;
  llm: LlmConfig;
  embedding: EmbeddingConfig;
}

export interface MemoryFile {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  created: string;
  modified: string;
  content: string;
  raw: string;
}

export interface SearchResult {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  score: number;
}

export interface SummarizeResult {
  title: string;
  summary: string;
  suggested_path: string;
  tags: string[];
  content: string;
}

export interface CrossLinkDecision {
  link: boolean;
  reason: string;
}

export interface IndexResult {
  indexed: number;
  errors: number;
}

export interface PullResult {
  pulled: number;
  summary: string;
}

export interface GitStatus {
  remote: string;
  branch: string;
  unpushed: number;
  changes: boolean;
  files: string[];
}

export interface WriteMemoryData {
  title: string;
  summary: string;
  tags: string[];
  content: string;
  relatedSection?: string;
}
