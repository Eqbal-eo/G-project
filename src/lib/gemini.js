// Integration with Google Gemini API for Motion AI Chat and Document Summarization

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest'
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
  const userText = newUserPrompt ? newUserPrompt.trim() : '';

  if (attachedFile) {
    const parts = [];

    // Native PDF support via Gemini multimodal inlineData
    if (attachedFile.base64 && attachedFile.mimeType === 'application/pdf') {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: attachedFile.base64
        }
      });

      const promptLabel = userText || `Please thoroughly read and analyze this attached PDF document ("${attachedFile.name}"), provide an executive summary, and explain its key sections.`;
      parts.push({
        text: `[Attached PDF Document: ${attachedFile.name}]\n\nUser Request:\n${promptLabel}`
      });
    } else if (attachedFile.content) {
      // Extracted text from PowerPoint (.pptx), Word (.docx), or text files
      const docLabel = attachedFile.fileTypeLabel || 'Document';
      const fileHeader = `[Attached ${docLabel}: ${attachedFile.name}]\n\n--- Document Content ---\n${attachedFile.content}\n--- End of Document Content ---`;
      const promptLabel = userText || `Please read and analyze this ${docLabel} ("${attachedFile.name}") and provide a comprehensive summary and key takeaways.`;

      parts.push({
        text: `${fileHeader}\n\nUser Request:\n${promptLabel}`
      });
    } else if (userText) {
      parts.push({ text: userText });
    }

    if (parts.length > 0) {
      turns.push({
        role: 'user',
        parts
      });
    }
  } else if (userText) {
    if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
      turns[turns.length - 1].parts[0].text += `\n\n${userText}`;
    } else {
      turns.push({
        role: 'user',
        parts: [{ text: userText }]
      });
    }
  }

  // 3. Ensure contents starts with 'user' (Gemini requirement)
  while (turns.length > 0 && turns[0].role !== 'user') {
    turns.shift();
  }

  // 4. Ensure contents ends with 'user'
  while (turns.length > 0 && turns[turns.length - 1].role !== 'user') {
    turns.pop();
  }

  // 5. Safe fallback if somehow empty
  if (turns.length === 0) {
    turns.push({
      role: 'user',
      parts: [{ text: userText || 'Hello, how can you help me today?' }]
    });
  }

  return turns;
}

export async function chatWithGemini({ messages, newUserPrompt, attachedFile, workspaceContext, pageContext }) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key not found. Please ensure VITE_GEMINI_API_KEY is configured.');
  }

  const workspaceInfo = workspaceContext?.name ? `\nCurrent Workspace: "${workspaceContext.name}".` : '';
  const pageInfo = pageContext?.title
    ? `\nActive Page: "${pageContext.title}"\nCurrent Page Content:\n${pageContext.text || '(Empty page)'}\n`
    : '';

  const systemInstruction = `You are Motion AI, an expert workspace assistant, academic tutor, and document analyst built into the Motion Workspace productivity suite.${workspaceInfo}${pageInfo}

Your capabilities include:
1. **Document & Presentation Analysis**: Thoroughly reading, analyzing, and summarizing uploaded files (PDFs, PowerPoint presentations, Word documents, code, notes).
2. **Page Content Assistant & Controller**: You are directly connected to the user's active page. You can edit, rewrite, summarize, translate, generate tables, task lists, and modify page content. When the user asks to summarize, translate, or modify this page, output clean, structured content ready to be applied or inserted directly into the page editor.
3. **Exam & Quiz Generation**: When asked to create exam questions, generate well-crafted, realistic exam questions based directly on the attached file or page:
   - Multiple Choice Questions (MCQ) with 4 clear choices (A, B, C, D)
   - True / False questions with justifications
   - Short-answer and conceptual discussion questions
   - Always include the correct answers (Answer Key) and educational explanations at the end.
4. **Structured Summaries & Tasks**: Extract key ideas, core definitions, and convert plans into actionable task checklists and tables.
5. **English & Multilingual Fluency**: By default, keep all interface elements, explanations, and outputs in clear, high-quality English, while fluently translating to or from any other language when requested.

Formatting rules:
- Use clean, structured Markdown formatting (### Headers, bold highlights, bullet points, numbered lists, tables, and fenced code blocks).
- Be thorough, helpful, and concise.
- Base your answers strictly on the content of the attached document or active page when provided.`;

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
            temperature: 0.6,
            maxOutputTokens: 6000
          }
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.error?.message || `API Error (${response.status})`;
        // If high demand (503) or model unavailable, try next candidate
        if (response.status === 503 || response.status === 404 || errorMsg.includes('high demand') || errorMsg.includes('not available')) {
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
      if (err.message?.includes('high demand') || err.message?.includes('503') || err.message?.includes('not available')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Unable to receive a response from the model right now. Please try again in a few moments.');
}

