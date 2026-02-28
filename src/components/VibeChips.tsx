'use client';

import { Heart, Briefcase, Gem, Music, TreePine, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Vibe {
  id: string;
  label: string;
  icon: LucideIcon;
  query: string;
}

const vibes: Vibe[] = [
  {
    id: 'romantic',
    label: 'Romantic',
    icon: Heart,
    query: 'romantic intimate hotel for couples, cozy atmosphere, special occasion',
  },
  {
    id: 'business',
    label: 'Business',
    icon: Briefcase,
    query: 'business hotel, reliable wifi, work desk, meeting facilities, central location',
  },
  {
    id: 'boutique',
    label: 'Boutique',
    icon: Gem,
    query: 'boutique design hotel, unique character, stylish interiors, independent',
  },
  {
    id: 'party',
    label: 'Party',
    icon: Music,
    query: 'lively hotel near nightlife, bars and restaurants, vibrant neighborhood',
  },
  {
    id: 'quiet-escape',
    label: 'Quiet Escape',
    icon: TreePine,
    query: 'quiet peaceful hotel, tranquil setting, relaxing retreat away from crowds',
  },
  {
    id: 'family',
    label: 'Family',
    icon: Users,
    query: 'family friendly hotel, spacious rooms, kid amenities, safe neighborhood',
  },
];

interface VibeChipsProps {
  onVibeSelect: (vibeId: string, query: string) => void;
  activeVibe: string | null;
}

export function VibeChips({ onVibeSelect, activeVibe }: VibeChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="Search by vibe">
      {vibes.map((vibe) => {
        const Icon = vibe.icon;
        const isActive = activeVibe === vibe.id;
        return (
          <button
            key={vibe.id}
            onClick={() => onVibeSelect(vibe.id, vibe.query)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2"
            style={{
              backgroundColor: isActive ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
              color: isActive ? 'var(--gold-400)' : 'var(--navy-600)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: isActive ? 'var(--gold-500)' : 'var(--navy-800)',
            }}
            aria-pressed={isActive}
          >
            <Icon size={14} aria-hidden="true" />
            {vibe.label}
          </button>
        );
      })}
    </div>
  );
}
