import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../auth/AuthContext';
import { GlobalSearch } from '../shared/GlobalSearch';
import { KeyboardShortcutHint } from '../shared/KeyboardShortcutHint';

export function AppShell() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-75 flex items-center justify-center">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-75">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-11 bg-white border-b border-stone-200 flex items-center px-5 gap-4">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <KeyboardShortcutHint />
          </div>
        </header>
        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
