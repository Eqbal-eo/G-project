// Integration with Google Gemini API for Motion AI Chat and Document Summarization

const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getGeminiApiKey() {
  const envKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_GEMINI_API_KEY) || '';
  const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('motion_gemini_api_key') : '';
  return storedKey || envKey || '';
}

export function setGeminiApiKey(key) {
  if (typeof localStorage !== 'undefined') {
    if (key) {
      localStorage.setItem('motion_gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('motion_gemini_api_key');
    }
  }
}

export function buildGeminiContents({ history = [], newUserPrompt = '', attachedFile = null }) {
  const turns = [];

  // 1. Process previous history (up to last 10 messages)
  const recent = (history || []).slice(-10);
  for (const msg of recent) {
    if (!msg || !msg.text) continue;
    const role = msg.sender === 'user' ? 'user' : 'model';

    // Merge consecutive turns with the same role
    if (turns.length > 0 && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].parts[0].text += `\n\n${msg.text}`;
    } else {
      turns.push({
        role,
        parts: [{ text: msg.text }]
      });
    }
  }

  // 2. Format new user prompt + attached file
  let userText = newUserPrompt ? newUserPrompt.trim() : '';
  if (attachedFile) {
    const fileHeader = `[Attached File: ${attachedFile.name}]\n\n--- File Content ---\n${attachedFile.content}\n--- End of File Content ---`;
    userText = userText ? `${fileHeader}\n\nUser Request:\n${userText}` : `${fileHeader}\n\nPlease read and summarize this file accurately and explain the key points in detail.`;
  }

  // 3. Append the new user prompt
  if (userText) {
    if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
      turns[turns.length - 1].parts[0].text += `\n\n${userText}`;
    } else {
      turns.push({
        role: 'user',
        parts: [{ text: userText }]
      });
    }
  }

  // 4. Ensure contents starts with 'user' (Gemini API requirement)
  while (turns.length > 0 && turns[0].role !== 'user') {
    turns.shift();
  }

  // 5. Ensure contents ends with 'user' (Gemini requirement: requests ending with model turn are rejected)
  while (turns.length > 0 && turns[turns.length - 1].role !== 'user') {
    turns.pop();
  }

  // 6. Safe fallback if somehow empty
  if (turns.length === 0) {
    turns.push({
      role: 'user',
      parts: [{ text: userText || 'Hello, how can you help me today?' }]
    });
  }

  return turns;
}

export async function chatWithGemini({ messages, newUserPrompt, attachedFile, workspaceContext }) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key not found. Please ensure VITE_GEMINI_API_KEY is configured.');
  }

  const workspaceInfo = workspaceContext?.name ? `\nCurrent Workspace: "${workspaceContext.name}".` : '';

  const systemInstruction = `You are Motion AI, an intelligent, friendly, and expert workspace assistant built into the Motion Workspace productivity suite.${workspaceInfo}
You assist users with:
1. Thoroughly summarizing and analyzing uploaded files and documents.
2. Drafting notes, project plans, meeting minutes, and specifications.
3. Explaining technical concepts, database schemas, code, and architectures.
4. Organizing Kanban tasks, milestones, and workflows.

Always answer clearly in English (or the user's requested language). Use clean, rich markdown formatting with headers (###), bullet points, bold highlights, tables, and fenced code blocks where appropriate. If a file is attached, read and understand its full content carefully and deliver an accurate, well-structured summary or answer based on the user's instructions.`;

  const contents = buildGeminiContents({
    history: messages,
    newUserPrompt,
    attachedFile
  });

  let lastError = null;

  // Try candidate models in order to handle temporary provider spikes (503) seamlessly
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
          }
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.error?.message || `API Error (${response.status})`;
        // If high demand (503), try next model
        if (response.status === 503 || errorMsg.includes('high demand')) {
          lastError = new Error(errorMsg);
          continue;
        }
        throw new Error(errorMsg);
      }

      const candidate = data?.candidates?.[0];
      const replyText = candidate?.content?.parts?.[0]?.text;

      if (replyText) {
        return replyText;
      }
    } catch (err) {
      lastError = err;
      if (err.message?.includes('high demand') || err.message?.includes('503')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Unable to receive a response from the model right now. Please try again in a few moments.');
}
