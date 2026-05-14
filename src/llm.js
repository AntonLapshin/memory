/**
 * LLM operations via Ollama
 */
import { loadConfig } from './config.js';

/**
 * Call the LLM for chat completion
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [options]
 * @param {number} [options.temperature]
 * @param {boolean} [options.json] - Request JSON output
 * @returns {Promise<string>}
 */
export async function chat(messages, options = {}) {
  const config = loadConfig();
  const { baseUrl, model } = config.llm;

  const body = {
    model,
    messages,
    stream: false,
  };

  if (options.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }

  if (options.json) {
    body.format = 'json';
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `LLM request failed (${response.status}): ${errBody}`
    );
  }

  const data = await response.json();
  return data.message?.content || '';
}

/**
 * Summarize raw text into a memory object
 * @param {string} rawText - Raw text to summarize
 * @param {string} folderTree - Existing folder structure (top 3 levels)
 * @returns {Promise<import('./types.js').SummarizeResult>}
 */
export async function summarizeForMemory(rawText, folderTree) {
  const prompt = `You are a memory management assistant. Given raw text the user wants to save as a memory, produce a JSON object with these fields:

1. "title": A concise title (1-8 words)
2. "summary": A 2-5 sentence summary (max 500 characters) capturing the key facts
3. "suggested_path": A folder path following this convention:
   {domain}/{category}/{subcategory}/{filename}.md
   
   Domains: personal, work, learning, projects
   Use kebab-case for all folder and file names.
   Example paths: "personal/health/fitness/workout-routine.md", "work/my-project/architecture/design-decisions.md"
   
   Existing folder structure (top 3 levels):
   ${folderTree || '(empty — create initial structure)'}

4. "tags": 2-5 lowercase tags (array of strings)
5. "content": The cleaned, formatted memory content in markdown. Write in first person or factual third person. Keep it self-contained. Use [[wiki links]] for references to related concepts.

Rules:
- Be specific and factual in summaries
- Use kebab-case for folder and file names
- Group similar topics under the same parent folder
- If no existing folder fits, create a sensible new one

Raw text to process:
"""
${rawText.substring(0, 6000)}
"""

Return ONLY valid JSON, no other text.`;

  const response = await chat(
    [{ role: 'user', content: prompt }],
    { json: true, temperature: 0.3 }
  );

  // Try to extract JSON from the response
  let jsonText = response.trim();
  // Remove markdown code fences if present
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    // Fallback: try to extract JSON object
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) { /* fall through */ }
    }
    throw new Error(
      `Failed to parse LLM response as JSON. Response: ${response.substring(0, 500)}`
    );
  }
}

/**
 * Check if two memories should be cross-linked
 * @param {string} newMemorySummary
 * @param {string} candidateSummary
 * @param {string} candidatePath
 * @returns {Promise<{link: boolean, reason: string}>}
 */
export async function shouldCrossLink(newMemorySummary, candidateSummary, candidatePath) {
  const prompt = `You are evaluating whether two memories should be cross-referenced.

NEW MEMORY:
${newMemorySummary}

CANDIDATE MEMORY (path: ${candidatePath}):
${candidateSummary}

Should these two memories be cross-linked with [[wiki links]] to each other?
Only link if they share substantive context — same domain, same person, same project, same event, cause-effect relationship, or one is a sub-topic of the other.
Do not link if they are only tangentially related.

Respond with JSON: {"link": true/false, "reason": "brief reason"}`;

  const response = await chat(
    [{ role: 'user', content: prompt }],
    { json: true, temperature: 0.1 }
  );

  try {
    let jsonText = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const result = JSON.parse(jsonText);
    return { link: !!result.link, reason: result.reason || '' };
  } catch {
    return { link: false, reason: 'failed to parse LLM response' };
  }
}

/**
 * Generate a commit message for a memory change
 * @param {string} title
 * @param {'add'|'update'} action
 * @returns {Promise<string>}
 */
export async function generateCommitMessage(title, action) {
  const prompt = `Generate a concise, one-line git commit message (max 72 chars) for ${action === 'add' ? 'adding' : 'updating'} a memory titled "${title}". Use format "memory: <action> <description>". Return only the message text, no quotes.`;

  const response = await chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.3 }
  );

  return response.trim().replace(/^"|"$/g, '');
}
