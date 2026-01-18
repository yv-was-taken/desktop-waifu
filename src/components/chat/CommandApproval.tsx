import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAppStore } from '../../store';

export function CommandApproval() {
  const execution = useAppStore((state) => state.execution);
  const updateGeneratedCommand = useAppStore((state) => state.updateGeneratedCommand);
  const approveCommand = useAppStore((state) => state.approveCommand);
  const clearExecution = useAppStore((state) => state.clearExecution);

  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState('');

  const isPendingApproval = execution.status === 'pending_approval' && !!execution.generatedCommand;

  // Keyboard shortcuts: Enter = approve, Escape = reject
  // Must be before early return to satisfy React's rules of hooks
  useEffect(() => {
    if (!isPendingApproval || isEditing) {
      return; // No shortcuts unless pending approval and not editing
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        approveCommand();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearExecution();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPendingApproval, isEditing, approveCommand, clearExecution]);

  if (execution.status !== 'pending_approval' || !execution.generatedCommand) {
    return null;
  }

  const handleEdit = () => {
    setEditedCommand(execution.generatedCommand || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateGeneratedCommand(editedCommand);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedCommand('');
  };

  const handleApprove = () => {
    // CRITICAL: This is the ONLY user action that can approve command execution
    approveCommand();
  };

  const handleReject = () => {
    clearExecution();
  };

  return (
    <div className="mx-2 mb-4 bg-slate-900 border-2 border-slate-600 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm font-bold">Command Generated</span>
          {execution.task && (
            <span className="text-slate-400 text-xs truncate">
              Task: {execution.task}
            </span>
          )}
        </div>
      </div>

      {/* Command Display/Edit */}
      <div className="p-3">
        {isEditing ? (
          <textarea
            value={editedCommand}
            onChange={(e) => setEditedCommand(e.target.value)}
            className="w-full bg-slate-800 text-white font-mono text-sm p-3 rounded border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            autoFocus
          />
        ) : (
          <SyntaxHighlighter
            language="bash"
            style={oneDark}
            className="rounded text-sm !my-0 !bg-slate-800"
            customStyle={{ margin: 0, padding: '12px' }}
          >
            {execution.generatedCommand}
          </SyntaxHighlighter>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 px-3 pb-3">
        {isEditing ? (
          <>
            <button
              onClick={handleSaveEdit}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleApprove}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              Approve (Enter)
            </button>
            <button
              onClick={handleEdit}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleReject}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              Reject (Esc)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
