export interface GitConfig {
  remote: string;
  branch: string;
  tokenEnv?: string;
}

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai';
  model: string;
  baseUrl: string;
  dimensions: number;
  apiKeyEnv?: string;
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
}

export interface Config {
  version: number;
  git: GitConfig;
  embedding: EmbeddingConfig;
  logging: LoggingConfig;
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
}
