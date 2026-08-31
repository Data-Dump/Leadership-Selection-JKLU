import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, Briefcase, ClipboardCheck,
  Star, Calendar, CheckSquare, BarChart2, Upload, Settings,
  LogOut, ChevronLeft, ChevronRight, Shield, AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { clsx } from 'clsx';
import { useState } from 'react';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/candidates', icon: Users, label: 'Candidates' },
  { to: '/applications', icon: FileText, label: 'Applications' },
  { to: '/positions', icon: Briefcase, label: 'Positions' },
  { to: '/evaluation', icon: ClipboardCheck, label: 'Evaluation' },
  { to: '/shortlist', icon: Star, label: 'Shortlist' },
  { to: '/interviews', icon: Calendar, label: 'Interviews' },
  { to: '/final-selection', icon: CheckSquare, label: 'Final Selection' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/import', icon: Upload, label: 'Import Data', adminOnly: true },
  { to: '/data-quality', icon: AlertTriangle, label: 'Data Quality', adminOnly: true },
  { to: '/audit-log', icon: BookOpen, label: 'Audit Log', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const ROLE_COLORS: Record<string, string> = {
  'Super Admin': 'text-purple-300 font-semibold',
  Admin: 'text-amber-400',
  Evaluator: 'text-blue-400',
  Interviewer: 'text-purple-400',
  Viewer: 'text-stone-400',
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isAdminOrSuper = user?.role === 'Admin' || user?.role === 'Super Admin';

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly && !isAdminOrSuper) return false;
    return true;
  });

  return (
    <aside
      className={clsx(
        'flex flex-col bg-navy-700 text-white transition-all duration-200 shrink-0',
        'h-screen sticky top-0',
        collapsed ? 'w-14' : 'w-56'
      )}
      aria-label="Main navigation"
    >
      {/* Logo / Header */}
      <div className={clsx(
        'flex items-center border-b border-navy-600 py-4',
        collapsed ? 'justify-center px-0' : 'px-4 gap-3'
      )}>
        <img src="/logo.png" alt="JKLU" className="w-7 h-7 object-contain rounded shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-display text-sm leading-tight text-white">JKLU</div>
            <div className="text-2xs text-navy-300 uppercase tracking-wider truncate">Leadership Selection</div>
          </div>
        )}
      </div>

      {/* Centralized Cloud DB status indicator */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-2 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-emerald-300 text-2xs flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="truncate">Centralized Cloud DB (Live)</span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Sidebar navigation">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-2 py-2 rounded text-sm transition-colors duration-100 group',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-navy-300 hover:bg-white/10 hover:text-white'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={16} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: evaluator info + collapse */}
      <div className="border-t border-navy-600">
        {/* User info */}
        {user && !collapsed && (
          <div className="px-4 py-3">
            <div className="text-xs font-medium text-white truncate">{user.name}</div>
            <div className={clsx('text-2xs', ROLE_COLORS[user.role] || 'text-navy-300')}>
              {user.role}
            </div>
          </div>
        )}
        <div className={clsx('flex px-2 pb-3 gap-1', collapsed && 'flex-col items-center')}>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-navy-300 hover:text-white hover:bg-white/10 text-xs transition-colors w-full"
            title="Logout"
          >
            <LogOut size={14} />
            {!collapsed && <span>Logout</span>}
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center justify-center p-1.5 rounded text-navy-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
