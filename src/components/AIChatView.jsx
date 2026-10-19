import { useState, useEffect, useRef } from 'react';
import {
  getStoredChats,
  createNewAIChat,
  addMessageToChat
} from '../lib/aiChatStore.js';
import { chatWithGemini } from '../lib/gemini.js';

function renderMarkdownSnippet(text) {
  if (!text) return null;

  // Split into paragraphs / code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const firstLineBreak = part.indexOf('\n');
      const lang = firstLineBreak !== -1 ? part.slice(3, firstLineBreak).trim() : '';
      const code = firstLineBreak !== -1 ? part.slice(firstLineBreak + 1, -3) : part.slice(3, -3);

      return (
        <div key={index} className="my-3 rounded-lg overflow-hidden border border-outline-variant/20 bg-[#1e1e1e] text-stone-100 text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] text-stone-300 border-b border-white/5 font-mono">
            <span>{lang || 'code'}</span>
            <button
              type="button"
              className="text-[11px] hover:text-white transition-colors"
              onClick={() => navigator.clipboard.writeText(code)}
            >
              Copy
            </button>
          </div>
          <pre className="p-3 overflow-x-auto font-mono leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    // Process headers and bold/lists
    const lines = part.split('\n');
    return (
      <div key={index} className="space-y-1.5 leading-relaxed">
        {lines.map((line, lIdx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('### ')) {
            return <h4 key={lIdx} className="font-bold text-sm mt-3 mb-1 text-on-surface">{trimmed.replace('### ', '')}</h4>;
          }
          if (trimmed.startsWith('## ')) {
            return <h3 key={lIdx} className="font-bold text-base mt-4 mb-1.5 text-on-surface">{trimmed.replace('## ', '')}</h3>;
          }
          if (trimmed.startsWith('# ')) {
            return <h2 key={lIdx} className="font-bold text-lg mt-4 mb-2 text-on-surface">{trimmed.replace('# ', '')}</h2>;
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
            return (
              <li key={lIdx} className="ml-4 list-disc text-sm text-on-surface-variant">
                {formatInline(trimmed.slice(2))}
              </li>
            );
          }
          if (/^\d+\.\s/.test(trimmed)) {
            return (
              <p key={lIdx} className="text-sm text-on-surface-variant font-medium">
                {formatInline(trimmed)}
              </p>
            );
          }
          if (!trimmed) {
            return <div key={lIdx} className="h-2" />;
          }
          return <p key={lIdx} className="text-sm text-on-surface-variant">{formatInline(line)}</p>;
        })}
      </div>
    );
  });
}

function formatInline(str) {
  const tokens = str.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i} className="font-bold text-on-surface">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-surface-container-high font-mono text-xs text-primary font-semibold">
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

export default function AIChatView({ activeChatId, onSelectChat, workspace, user }) {
  const [chats, setChats] = useState(getStoredChats);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleUpdate = () => {
      setChats(getStoredChats());
    };
    window.addEventListener('motion:ai-chats-updated', handleUpdate);
    return () => window.removeEventListener('motion:ai-chats-updated', handleUpdate);
  }, []);

  const currentChat = chats.find((c) => c.id === activeChatId) || chats[0];

  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      onSelectChat?.(chats[0].id);
    }
  }, [activeChatId, chats, onSelectChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, isGenerating]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size is too large. Maximum allowed size is 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result || '';
      setAttachedFile({
        name: file.name,
        size: file.size,
        content: String(content)
      });
      // Suggest summary in input if empty
      if (!inputText.trim()) {
        setInputText(`Please read and summarize the file "${file.name}" and explain its key points.`);
      }
    };
    reader.onerror = () => {
      alert('An error occurred while reading the file.');
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }

  async function handleSendMessage(promptText) {
    const baseText = (promptText || inputText).trim();
    if (!baseText && !attachedFile) return;
    if (isGenerating) return;

    const textToSend = baseText || (attachedFile ? `Please read and summarize the file "${attachedFile.name}" and explain its key contents in detail.` : '');

    let targetChatId = currentChat?.id;
    if (!targetChatId) {
      const newChat = createNewAIChat(attachedFile ? `File: ${attachedFile.name}` : 'New chat');
      targetChatId = newChat.id;
      onSelectChat?.(newChat.id);
    }

    // Save user message with file badge if attached
    addMessageToChat(targetChatId, {
      sender: 'user',
      text: textToSend,
      fileName: attachedFile?.name || null
    });

    const fileToUpload = attachedFile;
    setAttachedFile(null);
    setInputText('');
    setIsGenerating(true);

    try {
      // Direct call to Gemini 3.5 Flash-Lite
      const aiResponseText = await chatWithGemini({
        messages: currentChat?.messages || [],
        newUserPrompt: textToSend,
        attachedFile: fileToUpload,
        workspaceContext: workspace
      });

      addMessageToChat(targetChatId, {
        sender: 'ai',
        text: aiResponseText
      });
    } catch (err) {
      console.error('Gemini chat error:', err);
      // Fallback
      const fallbackText = generateSmartAIResponse(textToSend, workspace, fileToUpload);
      addMessageToChat(targetChatId, {
        sender: 'ai',
        text: `${fallbackText}\n\n*(Notice: An error occurred while connecting directly to Gemini API: ${err.message})*`
      });
    } finally {
      setIsGenerating(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleStartNewChat() {
    const newChat = createNewAIChat('New chat');
    onSelectChat?.(newChat.id);
    setAttachedFile(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const starterPrompts = [
    { title: 'Schema & Tables Overview', prompt: 'Explain the database schema, core tables, and relationships in the project' },
    { title: 'Project Action Plan', prompt: 'Create an actionable project plan with a timeline and milestones' },
    { title: 'Organize Kanban Tasks', prompt: 'Suggest an organized task backlog for our workspace Kanban board' },
    { title: 'Summarize Attached File', prompt: 'I have a file I want you to analyze and extract a comprehensive summary from' }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-surface text-on-surface">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/15 bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
            <span className="material-symbols-outlined text-base">auto_awesome</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
              {currentChat?.title || 'Motion AI'}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                Gemini 3.5 Flash-Lite
              </span>
            </h2>
            <p className="text-[11px] text-on-surface-variant">
              Workspace AI Assistant &amp; Document Summarizer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New chat
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        {(!currentChat?.messages || currentChat.messages.length === 0) ? (
          <div className="max-w-2xl mx-auto py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 shadow-inner">
              <span className="material-symbols-outlined text-3xl">auto_awesome</span>
            </div>
            <h3 className="text-xl font-bold text-on-surface mb-2">How can I help you today?</h3>
            <p className="text-sm text-on-surface-variant mb-8 max-w-md mx-auto">
              Ask a question directly, or attach a file to summarize and analyze via Gemini AI.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {starterPrompts.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (item.title === 'Summarize Attached File') {
                      fileInputRef.current?.click();
                    } else {
                      handleSendMessage(item.prompt);
                    }
                  }}
                  className="p-3.5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest hover:bg-surface-container-high transition-colors text-left group"
                >
                  <p className="text-xs font-semibold text-primary mb-1 flex items-center justify-between">
                    {item.title}
                    <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                  </p>
                  <p className="text-xs text-on-surface-variant line-clamp-2">{item.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {currentChat.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 border border-primary/20">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.sender === 'user'
                      ? 'bg-primary text-on-primary rounded-br-sm'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/15 rounded-bl-sm'
                    }`}
                >
                  {msg.sender === 'user' ? (
                    <div>
                      {msg.fileName && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/20 text-[11px] font-mono mb-2">
                          <span className="material-symbols-outlined text-xs">description</span>
                          <span>{msg.fileName}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  ) : (
                    <div>
                      {renderMarkdownSnippet(msg.text)}
                      <div className="mt-3 pt-2 border-t border-outline-variant/10 flex items-center justify-end gap-2 text-xs text-on-surface-variant">
                        <button
                          type="button"
                          className="hover:text-primary transition-colors flex items-center gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.text);
                          }}
                        >
                          <span className="material-symbols-outlined text-xs">content_copy</span>
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                    {user?.email ? user.email.slice(0, 2).toUpperCase() : 'ME'}
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className="flex gap-3.5 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                </div>
                <div className="rounded-2xl px-4 py-3 bg-surface-container-lowest border border-outline-variant/15 rounded-bl-sm text-sm text-on-surface-variant flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]"></span>
                  <span className="text-xs text-on-surface-variant ml-1 font-medium">Gemini is thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-outline-variant/15 bg-surface-container-lowest">
        <div className="max-w-3xl mx-auto">
          {/* Attached File Chip Preview */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/30 text-xs w-fit shadow-xs">
              <span className="material-symbols-outlined text-sm text-primary">description</span>
              <span className="font-semibold text-on-surface">{attachedFile.name}</span>
              <span className="text-[10px] text-on-surface-variant">({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="text-on-surface-variant hover:text-red-500 ml-1.5 flex items-center justify-center"
                title="Remove file"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.csv,.py,.sql,.xml,.yaml,.yml,.log"
            onChange={handleFileSelect}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2 p-2 rounded-xl border border-outline-variant/25 bg-surface focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-sm"
          >
            {/* File Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:bg-surface-container-high flex items-center justify-center flex-shrink-0 transition-colors"
              title="Attach a file (text / code / report) for summarization or analysis"
            >
              <span className="material-symbols-outlined text-lg">attach_file</span>
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your question, or attach a file to summarize... (Press Enter to send)"
              className="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-on-surface placeholder:text-on-surface-variant/50 px-2 py-1 max-h-32 leading-relaxed"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && !attachedFile) || isGenerating}
              className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
              aria-label="Send message"
            >
              <span className="material-symbols-outlined text-base">arrow_upward</span>
            </button>
          </form>
          <p className="text-[10px] text-center text-on-surface-variant/60 mt-2">
            Connected to Google Gemini 3.5 Flash-Lite • Supports attaching code and text documents for instant analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

function generateSmartAIResponse(prompt, workspace, file) {
  if (file) {
    return `### Summary of "${file.name}":
- **File size:** ${(file.size / 1024).toFixed(1)} KB.
- File received and content read successfully.

${file.content.substring(0, 300)}...`;
  }

  return `Welcome! I am your Motion AI assistant. You can ask me anything about your project or attach a document for instant analysis and summarization.`;
}
