import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { db } from '../../data/db';
import Fuse from 'fuse.js';
import type { Candidate } from '../../types';
import { useDebounce } from '../../hooks/useDebounce';

interface SearchResult {
  id: string;
  fullName: string;
  rollNumber: string;
  primaryPosition?: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 200);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const search = async () => {
      const candidates = await db.candidates.toArray();
      const apps = await db.applications.toArray();

      // Build search data with primary position
      const searchData = candidates.map(c => {
        const primaryApp = apps.find(a => a.candidateId === c.id && a.preferenceOrder === 1);
        return {
          id: c.id,
          fullName: c.fullName,
          rollNumber: c.rollNumber,
          email: c.email,
          primaryPosition: primaryApp?.position,
          club: primaryApp?.club,
        };
      });

      const fuse = new Fuse(searchData, {
        keys: ['fullName', 'rollNumber', 'email', 'primaryPosition', 'club'],
        threshold: 0.35,
        includeScore: true,
      });

      const fuseResults = fuse.search(debouncedQuery).slice(0, 8);
      setResults(fuseResults.map(r => r.item));
      setIsLoading(false);
    };

    search().catch(() => setIsLoading(false));
  }, [debouncedQuery]);

  const handleSelect = useCallback((id: string) => {
    navigate(`/candidates/${id}`);
    setQuery('');
    setIsOpen(false);
  }, [navigate]);

  return (
    <div className="relative w-72">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search candidates… (/)"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-8 pr-7 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-navy-700 focus:border-navy-700 focus:bg-white"
          aria-label="Search candidates"
          aria-autocomplete="list"
          aria-expanded={isOpen && results.length > 0}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && query && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded shadow-lg z-50 overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-stone-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-stone-400">No candidates found for "{query}"</div>
          ) : (
            <ul role="listbox">
              {results.map(r => (
                <li key={r.id} role="option">
                  <button
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 flex items-start gap-3 border-b border-stone-100 last:border-0"
                    onClick={() => handleSelect(r.id)}
                  >
                    <div>
                      <div className="text-sm font-medium text-stone-800">{r.fullName}</div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {r.rollNumber}
                        {r.primaryPosition && <span className="ml-2">· {r.primaryPosition}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
