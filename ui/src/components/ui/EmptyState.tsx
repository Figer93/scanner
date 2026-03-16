/**
 * EmptyState — shown when a list, table, or section has no data.
 * Passes all three silent design tests: premium feel, clear purpose, accessible.
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
    /** Lucide icon component to display */
    icon?: LucideIcon;
    title: string;
    description?: string;
    /** Optional primary CTA */
    action?: {
        label: string;
        onClick: () => void;
    };
    /** Optional secondary CTA (e.g. "Learn more") */
    secondaryAction?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
    /** Compact variant for use inside cards */
    compact?: boolean;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    secondaryAction,
    className,
    compact = false,
}: EmptyStateProps) {
    return (
        <div
            role="status"
            aria-label={title}
            className={cn(
                'flex flex-col items-center justify-center text-center',
                compact ? 'py-8 px-4' : 'py-16 px-6',
                className
            )}
        >
            {Icon && (
                <div
                    className="mb-4 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10"
                    style={{ width: compact ? 48 : 64, height: compact ? 48 : 64 }}
                    aria-hidden="true"
                >
                    <Icon
                        size={compact ? 22 : 28}
                        className="text-white/30"
                        strokeWidth={1.5}
                    />
                </div>
            )}

            <h3
                className={cn(
                    'font-semibold tracking-tight text-white/80',
                    compact ? 'text-sm' : 'text-base'
                )}
            >
                {title}
            </h3>

            {description && (
                <p
                    className={cn(
                        'mt-1.5 text-white/40 leading-relaxed max-w-xs',
                        compact ? 'text-xs' : 'text-sm'
                    )}
                >
                    {description}
                </p>
            )}

            {(action || secondaryAction) && (
                <div className="mt-6 flex items-center gap-3 flex-wrap justify-center">
                    {action && (
                        <button
                            type="button"
                            onClick={action.onClick}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-inner px-4 font-medium transition-all',
                                'bg-[var(--color-accent-primary)] text-white',
                                'hover:opacity-90 focus-visible:outline-none',
                                'focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                                compact ? 'text-xs py-1.5' : 'text-sm py-2'
                            )}
                        >
                            {action.label}
                        </button>
                    )}
                    {secondaryAction && (
                        <button
                            type="button"
                            onClick={secondaryAction.onClick}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-inner px-4 font-medium transition-all',
                                'bg-white/5 text-white/60 border border-white/10',
                                'hover:bg-white/10 hover:text-white/80 focus-visible:outline-none',
                                'focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                                compact ? 'text-xs py-1.5' : 'text-sm py-2'
                            )}
                        >
                            {secondaryAction.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
