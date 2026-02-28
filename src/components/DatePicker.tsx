'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

export function DatePicker({ date, onDateChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  function handleSelect(selected: Date | undefined) {
    if (selected) {
      onDateChange(selected);
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg border border-[var(--navy-800)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--gold-500)] hover:text-[var(--text-primary)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2 w-[200px]"
          aria-label={`Selected check-in date: ${format(date, 'EEE, MMM d, yyyy')}`}
        >
          <CalendarIcon size={16} className="text-[var(--text-muted)]" aria-hidden="true" />
          <span>{format(date, 'EEE, MMM d, yyyy')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={{ before: new Date() }}
          defaultMonth={date}
        />
      </PopoverContent>
    </Popover>
  );
}
