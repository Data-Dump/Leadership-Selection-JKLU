import { useState } from 'react';
import { Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { key: '/', description: 'Focus search' },
  { key: 'Esc', description: 'Close modal / search' },
  { key: 'N', description: 'Next candidate' },
  { key: 'P', description: 'Previous candidate' },
  { key: 'E', description: 'Start evaluation' },
  { key: 'S', description: 'Shortlist candidate' },
];

export function KeyboardShortcutHint() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 text-xs transition-colors"
        title="Keyboard shortcuts"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard size={13} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-stone-200 rounded shadow-xl w-72 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <h2 className="font-medium text-stone-800 text-sm">Keyboard Shortcuts</h2>
            </div>
            <ul className="py-2">
              {SHORTCUTS.map(s => (
                <li key={s.key} className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-sm text-stone-600">{s.description}</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded text-xs font-mono text-stone-700">
                    {s.key}
                  </kbd>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-stone-100">
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
