/**
 * Embedding operations via Ollama
 */
import { loadConfig } from './config.js';

/**
 * Generate embedding for a text string
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  const config = loadConfig();
  const { baseUrl, model } = config.embedding;

  const response = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Embedding request failed (${response.status}): ${body}`
    );
  }

  const data = await response.json();
  return data.embeddings?.[0] || data.embedding;
}

/**
 * Batch generate embeddings
 * @param {string[]} texts
 * @param {function(number, number): void} [onProgress]
 * @returns {Promise<number[][]>}
 */
export async function generateEmbeddingsBatch(texts, onProgress) {
  const results = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = await generateEmbedding(texts[i]);
    results.push(emb);
    if (onProgress) onProgress(i + 1, texts.length);
  }
  return results;
}
