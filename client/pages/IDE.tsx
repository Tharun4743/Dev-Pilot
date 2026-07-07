import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Play,
  Sparkles,
  Sun,
  Moon,
  Code2,
  Download,
  Upload,
  FilePlus,
  Server,
  ChevronDown,
  Eye,
  Loader2,
} from 'lucide-react';
import { ResizableTerminal, type TerminalOutput } from '../components/ResizableTerminal';
import { DevPilotPanel } from '../components/DevPilotPanel';

// Lazy-load Monaco to keep initial bundle small
const Editor = lazy(() =>
  import('@monaco-editor/react').then(m => ({ default: m.Editor }))
);

// ─── Language configuration ───────────────────────────────────────────────────

type Language = {
  id: string;
  label: string;
  monacoId: string;
  filename: string;
  template: string;
};

const LANGUAGES: Language[] = [
  {
    id: 'python',
    label: 'Python',
    monacoId: 'python',
    filename: 'main.py',
    template: `def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()`,
  },
  {
    id: 'c',
    label: 'C',
    monacoId: 'c',
    filename: 'main.c',
    template: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
  },
  {
    id: 'cpp',
    label: 'C++',
    monacoId: 'cpp',
    filename: 'main.cpp',
    template: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
  },
  {
    id: 'java',
    label: 'Java',
    monacoId: 'java',
    filename: 'Main.java',
    template: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    monacoId: 'javascript',
    filename: 'main.js',
    template: `function main() {\n    console.log("Hello, World!");\n}\n\nmain();`,
  },
  {
    id: 'html',
    label: 'HTML',
    monacoId: 'html',
    filename: 'index.html',
    template: `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <title>Hello</title>\n    <style>\n        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }\n    </style>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>`,
  },
  {
    id: 'css',
    label: 'CSS',
    monacoId: 'css',
    filename: 'style.css',
    template: `body {\n    margin: 0;\n    font-family: 'Inter', sans-serif;\n    background: #0f172a;\n    color: #e2e8f0;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    height: 100vh;\n}`,
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

const EMPTY_OUTPUT: TerminalOutput = {
  stdout: null,
  stderr: null,
  exitCode: null,
  time: null,
  isRunning: false,
};

// ─── IDE Component ────────────────────────────────────────────────────────────

export function IDE() {
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [code, setCode] = useState(LANGUAGES[0].template);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [terminalOutput, setTerminalOutput] = useState<TerminalOutput>(EMPTY_OUTPUT);
  const [terminalHeight, setTerminalHeight] = useState(220);

  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Language switching ──────────────────────────────────────────────────────
  const switchLanguage = (langId: string) => {
    const lang = LANGUAGES.find(l => l.id === langId);
    if (!lang || lang.id === language.id) return;
    setLanguage(lang);
    setCode(lang.template);
    setTerminalOutput(EMPTY_OUTPUT);
    setShowPreview(false);
  };

  // ── AI Code Generation ──────────────────────────────────────────────────────
  const generateCode = async (promptText: string) => {
    if (!promptText.trim()) return;
    setIsGenerating(true);
    setCode(''); // clear current code
    try {
      const res = await fetch('/api/execute/analyze-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: language.id,
          sourceCode: promptText,
          action: 'Generate Code',
        }),
      });

      if (!res.ok) {
        throw new Error('Code generation failed');
      }

      if (!res.body) throw new Error('No stream body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedCode = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulatedCode += parsed.text;
              setCode(accumulatedCode);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
      setCode(`// Error generating code: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Run code ───────────────────────────────────────────────────────────────
  const runCode = useCallback(async () => {
    if (!code.trim()) return;

    // HTML/CSS — show preview directly
    if (language.id === 'html' || language.id === 'css') {
      let html = code;
      if (language.id === 'css') {
        html = `<html><head><style>${code}</style></head><body><div style="padding:2rem;font-family:sans-serif;color:#e2e8f0;">Preview: CSS applied</div></body></html>`;
      }
      setPreviewContent(html);
      setShowPreview(true);
      setTerminalOutput({
        ...EMPTY_OUTPUT,
        stdout: `[${language.label} — rendered in Preview panel →]`,
        exitCode: 0,
        time: 0,
      });
      return;
    }

    setShowPreview(false);
    setTerminalOutput({ ...EMPTY_OUTPUT, isRunning: true });

    try {
      const res = await fetch('/api/execute/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: language.id,
          sourceCode: code,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setTerminalOutput({
        stdout: data.stdout || null,
        stderr: data.stderr || null,
        exitCode: data.exitCode ?? 0,
        time: data.time ?? null,
        isRunning: false,
        isPreview: data.isPreview,
      });
    } catch (e: unknown) {
      setTerminalOutput({
        stdout: null,
        stderr: (e as Error).message,
        exitCode: 1,
        time: null,
        isRunning: false,
      });
    }
  }, [code, language]);

  // Ctrl+Enter → Run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runCode]);

  // ── File management ────────────────────────────────────────────────────────
  const newFile = () => {
    setCode(language.template);
    setTerminalOutput(EMPTY_OUTPUT);
  };

  const openFile = () => fileInputRef.current?.click();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCode(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadFile = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = language.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Layout dimensions ──────────────────────────────────────────────────────
  const TOOLBAR_H = 44;   // px
  const STATUSBAR_H = 24; // px

  return (
    <div
      className="flex flex-col overflow-hidden bg-[#0d1117]"
      style={{ height: '100vh' }}
    >
      {/* ═══════════════════════════════ TOOLBAR ════════════════════════════ */}
      <header
        style={{ height: TOOLBAR_H }}
        className="flex items-center justify-between px-3 bg-[#161b22] border-b border-[#21262d] shrink-0 gap-3"
      >
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <Code2 className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-bold text-[#e6edf3] tracking-tight">DevPilot</span>
        </div>

        {/* Left controls */}
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="relative">
            <select
              value={language.id}
              onChange={e => switchLanguage(e.target.value)}
              className="appearance-none bg-[#21262d] border border-[#30363d] text-[#e6edf3] text-xs rounded px-2.5 py-1.5 pr-7 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-[#484f58] transition-colors font-mono"
            >
              {LANGUAGES.map(l => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#7d8590] pointer-events-none" />
          </div>

          {/* Font size */}
          <select
            value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
            className="appearance-none bg-[#21262d] border border-[#30363d] text-[#7d8590] text-xs rounded px-2 py-1.5 focus:outline-none hover:border-[#484f58] transition-colors cursor-pointer"
          >
            {[12, 13, 14, 15, 16, 18, 20].map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>

          {/* AI Code Writer */}
          <div className="flex items-center">
            <input
              type="text"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="Ask AI to write code (e.g. binary search)..."
              disabled={isGenerating}
              onKeyDown={e => {
                if (e.key === 'Enter' && aiPrompt.trim() && !isGenerating) {
                  generateCode(aiPrompt);
                }
              }}
              className="bg-[#21262d] border border-[#30363d] text-xs text-[#e6edf3] rounded-l px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 w-60 hover:border-[#484f58] transition-colors placeholder:text-[#505762]"
            />
            <button
              onClick={() => generateCode(aiPrompt)}
              disabled={isGenerating || !aiPrompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-r px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors border-y border-r border-[#30363d] cursor-pointer"
              title="Generate Code"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              AI Write
            </button>
          </div>
        </div>

        {/* Center — Run */}
        <button
          onClick={runCode}
          disabled={terminalOutput.isRunning}
          className="flex items-center gap-2 px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-xs font-semibold rounded shadow-lg shadow-emerald-900/30 transition-colors"
          title="Run (Ctrl+Enter)"
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </button>

        {/* AI + file buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {/* File ops */}
          <button onClick={newFile}      title="New file"   className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"><FilePlus className="h-4 w-4" /></button>
          <button onClick={openFile}     title="Open file"  className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"><Upload className="h-4 w-4" /></button>
          <button onClick={downloadFile} title="Save/Download" className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"><Download className="h-4 w-4" /></button>

          <div className="w-px h-5 bg-[#30363d]" />

          {/* DevPilot AI toggle */}
          <button
            onClick={() => setShowAIPanel(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              showAIPanel
                ? 'bg-indigo-600 text-white'
                : 'bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#30363d]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            DevPilot AI
          </button>

          {/* Preview toggle (HTML/CSS) */}
          {(language.id === 'html' || language.id === 'css') && (
            <button
              onClick={() => setShowPreview(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                showPreview
                  ? 'bg-sky-700 text-white'
                  : 'bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#30363d]'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          )}

          <div className="w-px h-5 bg-[#30363d]" />

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => (t === 'vs-dark' ? 'light' : 'vs-dark'))}
            className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
            title="Toggle theme"
          >
            {theme === 'vs-dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════ BODY ═══════════════════════════════ */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ height: `calc(100vh - ${TOOLBAR_H + STATUSBAR_H}px)` }}
      >
        {/* ─── EDITOR + TERMINAL column ─────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-[#7d8590] text-sm">
                  Loading editor…
                </div>
              }
            >
              <Editor
                height="100%"
                language={language.monacoId}
                theme={theme}
                value={code}
                onChange={v => setCode(v ?? '')}
                options={{
                  fontSize,
                  minimap: { enabled: true },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  folding: true,
                  autoIndent: 'full',
                  autoClosingBrackets: 'always',
                  autoClosingQuotes: 'always',
                  formatOnPaste: true,
                  formatOnType: true,
                  bracketPairColorization: { enabled: true },
                  stickyScroll: { enabled: true },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  renderLineHighlight: 'all',
                  scrollBeyondLastLine: false,
                  glyphMargin: true,
                  padding: { top: 8, bottom: 8 },
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                  tabSize: 4,
                  detectIndentation: true,
                  automaticLayout: true,
                }}
              />
            </Suspense>
          </div>

          {/* Resizable terminal */}
          <ResizableTerminal
            output={terminalOutput}
            height={terminalHeight}
            onHeightChange={setTerminalHeight}
            onClear={() => setTerminalOutput(EMPTY_OUTPUT)}
          />
        </div>

        {/* ─── DEVPILOT PANEL (right) ───────────────────────────────────────── */}
        {showAIPanel && (
          <div className="w-[380px] shrink-0 overflow-hidden border-l border-[#21262d]">
            <DevPilotPanel
              language={language.label}
              sourceCode={code}
              onClose={() => setShowAIPanel(false)}
            />
          </div>
        )}

        {/* ─── HTML/CSS PREVIEW PANEL (right) ───────────────────────────── */}
        {showPreview && !showAIPanel && (
          <div className="w-[480px] shrink-0 overflow-hidden border-l border-[#21262d] flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
              <span className="text-xs font-semibold text-[#7d8590] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview
              </span>
              <button
                onClick={() => setShowPreview(false)}
                className="text-[11px] text-[#7d8590] hover:text-[#e6edf3]"
              >
                ✕
              </button>
            </div>
            <iframe
              srcDoc={previewContent}
              className="flex-1 w-full bg-white"
              sandbox="allow-scripts"
              title="HTML Preview"
            />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════ STATUS BAR ══════════════════════════ */}
      <div
        style={{ height: STATUSBAR_H }}
        className="flex items-center px-3 bg-[#1f2937] border-t border-[#21262d] shrink-0 text-[11px] text-[#7d8590] gap-4 select-none"
      >
        <span className="font-mono">{language.filename}</span>
        <span>{language.label}</span>
        <span>{fontSize}px</span>
        <span className="ml-auto flex items-center gap-1">
          <Server className="h-3 w-3 text-emerald-400" /> Backend Execution
        </span>
        <span className="text-indigo-400 font-semibold">DevPilot</span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".py,.js,.ts,.c,.cpp,.java,.html,.css,.go,.rs,.php,.cs,.kt,.swift,.dart,.rb,.sh,.sql"
        onChange={handleFileUpload}
      />
    </div>
  );
}
