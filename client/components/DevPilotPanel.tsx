import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  Sparkles,
  Wrench,
  HelpCircle,
  Zap,
  X,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';

type AIAction = 'Analyze Code' | 'Fix Code' | 'Explain Code' | 'Optimize Code';

interface DevPilotPanelProps {
  language: string;
  sourceCode: string;
  onClose: () => void;
}

const ACTIONS: { id: AIAction; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'Analyze Code',  label: 'Analyze',  icon: Sparkles,   color: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30' },
  { id: 'Fix Code',      label: 'Fix',      icon: Wrench,     color: 'bg-emerald-700 hover:bg-emerald-600 shadow-emerald-900/30' },
  { id: 'Explain Code',  label: 'Explain',  icon: HelpCircle, color: 'bg-sky-700 hover:bg-sky-600 shadow-sky-900/30' },
  { id: 'Optimize Code', label: 'Optimize', icon: Zap,        color: 'bg-amber-700 hover:bg-amber-600 shadow-amber-900/30' },
];

/** Very lightweight inline markdown → HTML renderer */
function renderMarkdown(text: string): string {
  return text
    // Fenced code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> blocks in <ul>
    .replace(/(<li>[\s\S]+?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>')
    // Paragraphs (two+ newlines → <p>)
    .replace(/\n{2,}(?!<)/g, '</p><p>')
    // Single newlines inside paragraphs
    .replace(/([^>])\n(?!<)/g, '$1<br/>');
}

export function DevPilotPanel({ language, sourceCode, onClose }: DevPilotPanelProps) {
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const runAction = useCallback(
    async (action: AIAction) => {
      if (!sourceCode.trim()) {
        setError('The editor is empty. Write some code first.');
        return;
      }

      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setActiveAction(action);
      setContent('');
      setError(null);
      setIsLoading(true);

      try {
        const res = await fetch('/api/execute/analyze-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, sourceCode, action }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail ?? 'Server error');
        }

        if (!res.body) throw new Error('No response stream');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            if (raw === '[DONE]') { setIsLoading(false); return; }
            try {
              const parsed = JSON.parse(raw);
              if (parsed.error) { setError(parsed.error); setIsLoading(false); return; }
              if (parsed.text) setContent(prev => prev + parsed.text);
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [language, sourceCode],
  );

  // Clean up on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const copyContent = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-[#21262d] overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-[#e6edf3]">DevPilot AI</span>
          {language && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-[#7d8590] uppercase font-mono">
              {language}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-[#0d1117] border-b border-[#21262d] shrink-0">
        {ACTIONS.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => runAction(id)}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white shadow-lg transition-all disabled:opacity-50 ${color} ${
              activeAction === id ? 'ring-2 ring-white/20' : ''
            }`}
          >
            {isLoading && activeAction === id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Content header */}
        {(content || isLoading) && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#21262d] shrink-0">
            <span className="text-[11px] text-[#7d8590] uppercase tracking-wider font-semibold">
              {activeAction ?? 'Result'}
            </span>
            {content && (
              <button
                onClick={copyContent}
                className="flex items-center gap-1 text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4">
          {isLoading && !content && (
            <div className="flex flex-col items-center justify-center h-32 gap-3 text-[#7d8590]">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
              <p className="text-sm animate-pulse">DevPilot is thinking…</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#21262d] border border-[#f8514930] text-[#f85149] text-sm fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!content && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[#7d8590] text-center fade-in">
              <Sparkles className="h-8 w-8 text-indigo-500/40" />
              <div className="text-sm">Select an action above to analyze your code with DevPilot AI.</div>
            </div>
          )}

          {content && (
            <div
              className="ai-content text-sm leading-relaxed fade-in"
              dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(content)}</p>` }}
            />
          )}

          {isLoading && content && (
            <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse rounded-sm ml-0.5" />
          )}
        </div>
      </div>
    </div>
  );
}
