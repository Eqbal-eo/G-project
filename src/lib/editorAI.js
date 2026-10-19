import { getGeminiApiKey } from './gemini.js';
import { supabase } from './supabase.js';

const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

const PROMPTS = {
  improve: 'Improve the writing of the following text. Enhance clarity, flow, and elegance while preserving the original meaning and language. Return only the revised text without meta-commentary.',
  proofread: 'Proofread the following text. Fix all spelling, grammatical, and punctuation errors while keeping the style and meaning unchanged. Return only the corrected text without meta-commentary.',
  rewrite: 'Rewrite the following text to make it more engaging and natural while preserving the key message. Return only the rewritten text without meta-commentary.',
  summarize: 'Provide a concise, clear summary of the following text. Capture the essential points. Return only the summary text without meta-commentary.',
  explain: 'Explain the following text or concepts simply and clearly. Return only the explanation without meta-commentary.',
  translate: (lang = 'English') => `Translate the following text into ${lang} accurately and naturally. Return only the translation without meta-commentary.`,
  tone: (toneName = 'Professional') => `Rewrite the following text with a ${toneName} tone. Maintain the core message. Return only the rewritten text without meta-commentary.`
};

function fallbackLocalAI(text, action, options = {}) {
  const clean = String(text || '').trim();
  if (!clean) return '';

  if (action === 'proofread' || action === 'improve') {
    return clean.replace(/\s+/g, ' ').replace(/(^\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
  }
  if (action === 'summarize') {
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    return sentences.slice(0, 2).join(' ').trim();
  }
  if (action === 'rewrite') {
    return clean;
  }
  if (action === 'tone') {
    const tone = options.tone || 'Professional';
    if (tone.toLowerCase() === 'casual') {
      return clean.replace(/furthermore|moreover|consequently/gi, 'also');
    }
    return clean;
  }
  if (action === 'translate') {
    return `[Translation to ${options.language || 'English'}]: ${clean}`;
  }
  return clean;
}

export async function executeAIAction({ text, action, tone, language, signal }) {
  if (!text || !text.trim()) {
    throw new Error('Please select some text first.');
  }

  let instruction = PROMPTS[action];
  if (typeof instruction === 'function') {
    instruction = instruction(action === 'translate' ? (language || 'English') : (tone || 'Professional'));
  }
  if (!instruction) {
    instruction = PROMPTS.improve;
  }

  // 1. Try Supabase Edge Function if user is logged in
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const { data: result, error } = await supabase.functions.invoke('page-ai', {
        body: {
          prompt: `${instruction}\n\nText:\n"${text}"`,
          context: 'rich-text-selection-ai'
        },
        signal
      });
      if (!error && result?.text) {
        return result.text.trim();
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  // 2. Direct Gemini call if API key configured
  const apiKey = getGeminiApiKey();
  if (apiKey) {
    let lastError = null;
    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'You are an expert writing assistant in a Notion-like workspace. Output ONLY the resulting text directly, never use quotes around it, never add intro or outro pleasantries.' }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: `${instruction}\n\n"""\n${text}\n"""` }]
              }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2048
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          const candidateText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            return candidateText.trim().replace(/^"+|"+$/g, '');
          }
        } else {
          const errData = await response.json().catch(() => null);
          lastError = new Error(errData?.error?.message || `API error (${response.status})`);
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
      }
    }
    if (lastError && !lastError.message?.includes('high demand')) {
      // Return local fallback or propagate
    }
  }

  // 3. Fallback to local transform if no API key or network failure
  return fallbackLocalAI(text, action, { tone, language });
}
