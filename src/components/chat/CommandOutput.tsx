import { useState } from 'react';
import { useAppStore } from '../../store';

export function CommandOutput() {
  const execution = useAppStore((state) => state.execution);
  const clearExecution = useAppStore((state) => state.clearExecution);
  const [copied, setCopied] = useState(false);

  if (!execution.output && execution.status !== 'executing') {
    return null;
  }

  const handleCopy = async () => {
    const text = execution.output
      ? `${execution.output.stdout}${execution.output.stderr}`
      : '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  const handleDismiss = () => {
    clearExecution();
  };

  const isSuccess = execution.output?.exit_code === 0;
  const isExecuting = execution.status === 'executing';

  return (
    <div className="mx-2 mb-4 bg-slate-900 border-2 border-slate-600 rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-2 border-b border-slate-600 flex items-center justify-between ${
        isExecuting ? 'bg-blue-900' : isSuccess ? 'bg-green-900' : 'bg-red-900'
      }`}>
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <>
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-blue-300 text-sm font-bold">Executing...</span>
            </>
          ) : (
            <>
              <span className={`text-sm font-bold ${isSuccess ? 'text-green-300' : 'text-red-300'}`}>
                {isSuccess ? 'Command Succeeded' : 'Command Failed'}
              </span>
              {execution.output && (
                <span className="text-slate-400 text-xs">
                  (exit code: {execution.output.exit_code})
                </span>
              )}
            </>
          )}
        </div>
        {!isExecuting && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded transition-colors"
            >
              {copied ? '✓' : 'Copy'}
            </button>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Output Content */}
      <div className="p-3 max-h-48 overflow-y-auto">
        {isExecuting ? (
          <div className="flex items-center justify-center py-4">
            <div className="flex space-x-2">
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : execution.output ? (
          <div className="font-mono text-xs">
            {execution.output.stdout && (
              <pre className="text-slate-300 whitespace-pre-wrap break-words">
                {execution.output.stdout}
              </pre>
            )}
            {execution.output.stderr && (
              <pre className="text-red-400 whitespace-pre-wrap break-words mt-2">
                {execution.output.stderr}
              </pre>
            )}
            {!execution.output.stdout && !execution.output.stderr && (
              <span className="text-slate-500 italic">No output</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Error Message */}
      {execution.error && (
        <div className="px-3 pb-3">
          <div className="bg-red-900/50 border border-red-700 rounded p-2">
            <p className="text-red-300 text-xs">{execution.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
