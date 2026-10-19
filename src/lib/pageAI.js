import { supabase } from './supabase.js';
import { validateAIPlan, AI_BLOCK_TYPES } from './aiBlocks.js';
import { getGeminiApiKey } from './gemini.js';

const INSTRUCTIONS = `You draft useful structured content blocks for a Motion workspace page.
Return ONLY valid JSON with version: 1, title, and blocks.
JSON schema:
{
  "version": 1,
  "title": "Short title",
  "blocks": [
    { "type": "heading1", "content": "Section Title" },
    { "type": "text", "content": "Paragraph text" },
    { "type": "table", "rows": [["Header 1", "Header 2", "Header 3"], ["Row 1", "Row 2", "Row 3"]] },
    { "type": "todo", "content": "Task 1\\nTask 2" }
  ]
}
Allowed block types: ${AI_BLOCK_TYPES.join(', ')}.
Rules:
- For 'table' blocks: use ONLY "type": "table" and "rows": [[cell, cell, ...], [cell, cell, ...]]. Rows must have equal number of string columns (1-8 columns, 1-20 rows).
- For 'divider' blocks: use ONLY "type": "divider".
- For all other blocks: use ONLY "type" and "content" (plain string, newline-separated for todo/bulleted).
- Text must be plain text without markdown symbols (like #, **, -).
- Match the user's language (prefer English).
- If the user asks for a table, generate a rich, realistic table with meaningful headers and rows.
- If the user asks to plan, list, or format anything, structure it into clean, useful blocks.`;

const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

async function generatePageDraftDirectly({ prompt, pageContext, previousPlan }, signal) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Please set Gemini API key in .env or application settings.');
  }

  const userRequest = {
    request: prompt.trim(),
    page_context: pageContext || '',
    previous_draft: previousPlan || null
  };

  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(userRequest) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 6000
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = errorData?.error?.message || `API error (${response.status})`;
        if (response.status === 503 || msg.includes('high demand')) {
          lastError = new Error(msg);
          continue;
        }
        throw new Error(msg);
      }

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('No content received from the model.');

      return validateAIPlan(rawText);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (err.message?.includes('high demand') || err.message?.includes('503')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Unable to generate draft. Please try again.');
}

export async function generatePageDraft({ prompt, pageId, pageContext, previousPlan }, signal) {
  // First attempt via Supabase Edge Function if active
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const { data: result, error } = await supabase.functions.invoke('page-ai', {
        body: { prompt, pageId, ...(pageContext ? { pageContext } : {}), ...(previousPlan ? { previousPlan } : {}) },
        signal
      });

      if (signal?.aborted) throw new DOMException('Generation stopped', 'AbortError');

      if (!error && result?.plan) {
        return validateAIPlan(result.plan);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Fallback to direct Gemini generation
  }

  return generatePageDraftDirectly({ prompt, pageContext, previousPlan }, signal);
}
