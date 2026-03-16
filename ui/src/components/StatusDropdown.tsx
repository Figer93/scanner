/**
 * StatusDropdown — accessible status selector.
 * Keyboard: Arrow Up/Down to navigate, Enter/Space to select, Escape to close.
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

const STATUS_OPTIONS = ['New', 'Enriched', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted'] as const;
type StatusOption = typeof STATUS_OPTIONS[number];

const STATUS_COLORS: Record<StatusOption, string> = {
    New:                'bg-white/10 text-white/70 border-white/10',
    Enriched:           'bg-blue-500/20 text-blue-300 border-blue-400/30',
    'Email Sent':       'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
    Opened:             'bg-amber-500/20 text-amber-300 border-amber-400/30',
    'Waiting for Reply':'bg-amber-500/20 text-amber-300 border-amber-400/30',
    Replied:            'bg-violet-500/20 text-violet-300 border-violet-400/30',
    Converted:          'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
};

interface StatusDropdownProps {
    value?: string;
    onChange?: (status: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
}

export default function StatusDropdown({ value, onChange, disabled, ariaLabel }: StatusDropdownProps) {
    const [open, setOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const currentStatus = (value || 'New') as StatusOption;

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    // Focus the focused option when it changes
    useEffect(() => {
        if (open && focusedIndex >= 0) optionRefs.current[focusedIndex]?.focus();
    }, [open, focusedIndex]);

    const handleTriggerKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setFocusedIndex(STATUS_OPTIONS.indexOf(currentStatus));
        }
    }, [disabled, currentStatus]);

    const handleOptionKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            containerRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(Math.min(index + 1, STATUS_OPTIONS.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(Math.max(index - 1, 0));
        } else if (e.key === 'Home') {
            e.preventDefault();
            setFocusedIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setFocusedIndex(STATUS_OPTIONS.length - 1);
        } else if (e.key === 'Tab') {
            setOpen(false);
        }
    }, []);

    const handleSelect = useCallback((option: StatusOption) => {
        onChange?.(option);
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();
    }, [onChange]);

    const badgeCls = STATUS_COLORS[currentStatus] || STATUS_COLORS.New;

    return (
        <div className="relative inline-block" ref={containerRef}>
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${badgeCls} ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:opacity-80'}`}
                onClick={() => !disabled && setOpen((o) => !o)}
                onKeyDown={handleTriggerKeyDown}
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
            >
                {currentStatus}
                <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <div
                    className="absolute top-full left-0 mt-1 min-w-[180px] p-1 rounded-inner bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-card z-[var(--z-dropdown)]"
                    role="listbox"
                    aria-label={ariaLabel || 'Select status'}
                >
                    {STATUS_OPTIONS.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            role="option"
                            aria-selected={s === currentStatus}
                            ref={(el) => { optionRefs.current[i] = el; }}
                            className={`flex items-center w-full px-3 py-2 text-xs font-medium rounded text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] ${s === currentStatus ? 'bg-white/10' : 'hover:bg-white/6'}`}
                            onClick={() => handleSelect(s)}
                            onKeyDown={(e) => handleOptionKeyDown(e, i)}
                        >
                            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_COLORS[s]}`}>{s}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
