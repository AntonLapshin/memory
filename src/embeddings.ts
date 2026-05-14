import { loadConfig } from './config.js';
import { logger } from './logger.js';

export async function generateEmbedding(text: string): Promise<number[]> {
  const config = loadConfig();
  const { baseUrl, model } = config.embedding;

  logger.debug('Generating embedding', { model, textLen: text.length });

  const response = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Embedding request failed', { status: response.status, body, model, baseUrl });
    throw new Error(
      `Embedding request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as { embeddings?: number[][]; embedding?: number[] };
  const result = data.embeddings?.[0] || data.embedding || [];

  logger.debug('Embedding generated', { dimensions: result.length });

  return result;
}

export async function generateEmbeddingsBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = await generateEmbedding(texts[i]);
    results.push(emb);
    if (onProgress) onProgress(i + 1, texts.length);
  }
  return results;
}
