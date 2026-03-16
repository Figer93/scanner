/**
 * SkeletonCard — loading placeholder matching GlassCard dimensions.
 * Uses CSS animation that respects prefers-reduced-motion (handled in tokens.css).
 */

import { cn } from '../../lib/utils';

// ── Primitive ────────────────────────────────────────────────

interface SkeletonProps {
    className?: string;
}

/** Single skeleton line/block — compose to build layouts. */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'rounded-inner bg-white/6 motion-safe:animate-pulse',
                className
            )}
        />
    );
}

// ── Card variants ────────────────────────────────────────────

interface SkeletonCardProps {
    /** Number of text rows to show beneath the header */
    rows?: number;
    /** Show a stat chip row */
    showStats?: boolean;
    className?: string;
}

/**
 * Skeleton matching a standard GlassCard with a title + body rows.
 */
export function SkeletonCard({ rows = 3, showStats = false, className }: SkeletonCardProps) {
    return (
        <div
            aria-busy="true"
            aria-label="Loading…"
            className={cn(
                'bg-white/8 backdrop-blur-3xl border border-white/10 shadow-card rounded-card p-6',
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>

            {/* Body rows */}
            <div className="space-y-3">
                {Array.from({ length: rows }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className={cn('h-3', i === rows - 1 ? 'w-3/5' : 'w-full')}
                    />
                ))}
            </div>

            {/* Optional stat chips */}
            {showStats && (
                <div className="flex gap-2 mt-5">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                </div>
            )}
        </div>
    );
}

/** Skeleton for a compact table row. */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
    return (
        <tr aria-hidden="true">
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton className={cn('h-3 rounded', i === 0 ? 'w-32' : 'w-20')} />
                </td>
            ))}
        </tr>
    );
}

/** Grid of SkeletonCards for bento layouts. */
export function SkeletonGrid({ count = 6, cols = 3 }: { count?: number; cols?: number }) {
    const gridClass = cols === 2
        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
        : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6';
    return (
        <div className={gridClass} aria-busy="true" aria-label="Loading…">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} rows={3} showStats={i < 2} />
            ))}
        </div>
    );
}

export default SkeletonCard;
