'use client';

import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertCircle
        size={48}
        className="text-[var(--premium)] mb-4"
        aria-hidden="true"
      />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
        Something went wrong.
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="rounded-lg border-2 border-[var(--navy-800)] px-6 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--gold-500)] hover:text-[var(--gold-600)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
