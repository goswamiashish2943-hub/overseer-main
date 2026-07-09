// packages/dashboard/components/Sidebar.jsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PanelLeftClose, PanelLeftOpen,
  Activity, Map, Brain, History, LogOut, Eye,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard',    label: 'Live Analysis',  icon: Activity },
  { href: '/decision-map', label: 'Decision Map',   icon: Map      },
  { href: '/memory',       label: 'Memory',         icon: Brain    },
  { href: '/history',      label: 'History',        icon: History  },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col bg-surface-l1 border-r border-outline-variant/40 transition-all duration-300 ease-in-out flex-shrink-0 z-40 ${
        open ? 'w-56' : 'w-[60px]'
      }`}
    >
      {/* Toggle + Logo */}
      <div className="flex items-center gap-2 px-3 py-4 border-b border-outline-variant/30">
        <button
          onClick={() => setOpen(o => !o)}
          className="p-1.5 rounded-md hover:bg-surface-l2 text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label="Toggle sidebar"
        >
          {open ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
        </button>
        {open && (
          <span className="text-sm font-bold tracking-tight text-blue-500 whitespace-nowrap overflow-hidden">
            Overseer
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-200 group relative ${
                active
                  ? 'bg-surface-l2 text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-l2 hover:text-on-surface'
              }`}
            >
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-primary rounded-r-full" />
              )}
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-accent-primary' : ''}`} />
              {open && (
                <span className="whitespace-nowrap overflow-hidden">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-outline-variant/30 px-3 py-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-on-surface-variant/40 flex-shrink-0" />
          {open && (
            <span className="text-[10px] text-on-surface-variant/50 font-mono truncate">
              v0.1.0
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
