'use client';

import React from 'react';
import { Search, Link } from 'lucide-react';

interface TabNavProps {
  activeTab: 'search' | 'url-analyzer';
  onTabChange: (tab: 'search' | 'url-analyzer') => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <div role="tablist" className="flex border-b border-[var(--bg-muted)]">
      <button
        role="tab"
        aria-selected={activeTab === 'search'}
        onClick={() => onTabChange('search')}
        className={[
          'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
          activeTab === 'search'
            ? 'border-b-2 border-[var(--gold-500)] text-[var(--text-inverse)]'
            : 'text-[var(--navy-600)] hover:text-[var(--text-inverse)]',
        ].join(' ')}
      >
        <Search size={14} aria-hidden="true" />
        Search Hotels
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'url-analyzer'}
        onClick={() => onTabChange('url-analyzer')}
        className={[
          'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
          activeTab === 'url-analyzer'
            ? 'border-b-2 border-[var(--gold-500)] text-[var(--text-inverse)]'
            : 'text-[var(--navy-600)] hover:text-[var(--text-inverse)]',
        ].join(' ')}
      >
        <Link size={14} aria-hidden="true" />
        Check a Price
      </button>
    </div>
  );
}
