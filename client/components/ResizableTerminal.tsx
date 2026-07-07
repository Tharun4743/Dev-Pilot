import React, { useRef, useCallback, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Trash2,
  Loader2,
} from 'lucide-react';

export interface TerminalOutput {
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  time: number | null;
  isRunning: boolean;
  isPreview?: boolean;
}

interface ResizableTerminalProps {
  output: TerminalOutput;
  height: number;
  onHeightChange: (h: number) => void;
  onClear: () => void;
  minHeight?: number;
  maxHeight?: number;
}

export function ResizableTerminal({
  output,
  height,
  onHeightChange,
  onClear,
  minHeight = 80,
  maxHeight = 600,
}: ResizableTerminalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // Auto-scroll on new output
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [output]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = height;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [height],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY; // drag up = taller
      const newH = Math.max(minHeight, Math.min(maxHeight, startH.current + delta));
      onHeightChange(newH);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minHeight, maxHeight, onHeightChange]);

  const copyOutput = () => {
    const text = [output.stdout, output.stderr].filter(Boolean).join('\n\n');
    if (text) navigator.clipboard.writeText(text);
  };

  const hasError = output.exitCode !== null && output.exitCode !== 0;
  const hasOutput = output.stdout || output.stderr;

  return (
    <div
      style={{ height }}
      className="flex flex-col bg-[#0d1117] border-t border-[#21262d] shrink-0 overflow-hidden"
    >
      {/* ── Drag handle ── */}
      <div
        onMouseDown={onMouseDown}
        className="drag-handle h-[5px] bg-[#161b22] hover:bg-[#1f6feb] transition-colors flex-shrink-0"
        title="Drag to resize terminal"
      />

      {/* ── Terminal header ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#21262d] select-none shrink-0">
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[#7d8590] font-semibold uppercase tracking-wider">
            <TerminalIcon className="h-3.5 w-3.5" />
            Terminal
          </span>

          {output.isRunning && (
            <span className="flex items-center gap-1 text-[#58a6ff] animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" /> Running...
            </span>
          )}

          {!output.isRunning && output.exitCode !== null && (
            <>
              <span
                className={`flex items-center gap-1 font-medium ${
                  hasError ? 'text-[#f85149]' : 'text-[#3fb950]'
                }`}
              >
                {hasError ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Exit {output.exitCode}
              </span>

              {output.time !== null && (
                <span className="flex items-center gap-1 text-[#7d8590]">
                  <Clock className="h-3 w-3" />
                  {output.time}s
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={copyOutput}
            disabled={!hasOutput}
            title="Copy output"
            className="p-1 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors disabled:opacity-30"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClear}
            title="Clear terminal"
            className="p-1 rounded text-[#7d8590] hover:text-[#f85149] hover:bg-[#21262d] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Terminal content ── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed space-y-2"
      >
        {output.isRunning ? (
          <div className="terminal-info flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-[#58a6ff] rounded-full animate-ping" />
            Executing program...
          </div>
        ) : !hasOutput && output.exitCode === null ? (
          <div className="terminal-dim italic">
            Press <kbd className="bg-[#21262d] border border-[#30363d] rounded px-1 py-0.5 not-italic text-[11px]">Run</kbd> to execute your code.
          </div>
        ) : (
          <>
            {output.stdout && (
              <div className="space-y-1">
                <div className="terminal-dim text-[11px] uppercase tracking-wider">stdout</div>
                <pre className="terminal-stdout whitespace-pre-wrap break-words">
                  {output.stdout}
                </pre>
              </div>
            )}

            {output.stderr && (
              <div className="space-y-1">
                <div className="terminal-dim text-[11px] uppercase tracking-wider">stderr</div>
                <pre className="terminal-stderr whitespace-pre-wrap break-words">
                  {output.stderr}
                </pre>
              </div>
            )}

            {!hasOutput && output.exitCode !== null && (
              <div className="terminal-dim italic">Program exited with no output.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
