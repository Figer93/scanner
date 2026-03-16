/**
 * Modal — accessible overlay with focus trap, Escape close, aria-modal,
 * and backdrop click close. Built on a native <dialog> element for
 * correct stacking context and browser-native accessibility.
 */

import { useEffect, useRef, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
    /** Controls visibility */
    open: boolean;
    /** Called when user closes via Escape, backdrop click, or close button */
    onClose: () => void;
    title: string;
    /** Hides the title visually but keeps it for screen readers */
    titleHidden?: boolean;
    children: ReactNode;
    /** Max width variant */
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    /** Show built-in close button in header */
    showCloseButton?: boolean;
    className?: string;
}

const SIZE_CLASSES = {
    sm:   'max-w-sm',
    md:   'max-w-md',
    lg:   'max-w-lg',
    xl:   'max-w-2xl',
    full: 'max-w-[95vw]',
} satisfies Record<string, string>;

/** Collect all focusable elements within a container. */
function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => !el.closest('[aria-hidden="true"]'));
}

export default function Modal({
    open,
    onClose,
    title,
    titleHidden = false,
    children,
    size = 'md',
    showCloseButton = true,
    className,
}: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const lastFocusedRef = useRef<Element | null>(null);

    // Open / close native dialog and manage focus
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open) {
            lastFocusedRef.current = document.activeElement;
            if (!dialog.open) dialog.showModal();
            // Focus first focusable element inside modal
            const first = getFocusable(dialog)[0];
            if (first) first.focus();
        } else {
            if (dialog.open) dialog.close();
            // Restore focus to trigger element
            if (lastFocusedRef.current instanceof HTMLElement) {
                lastFocusedRef.current.focus();
            }
        }
    }, [open]);

    // Escape is handled natively by <dialog>, but we need to call onClose
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const handleCancel = (e: Event) => {
            e.preventDefault(); // prevent default close — we control state
            onClose();
        };
        dialog.addEventListener('cancel', handleCancel);
        return () => dialog.removeEventListener('cancel', handleCancel);
    }, [onClose]);

    // Focus trap: cycle focus within modal on Tab/Shift+Tab
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDialogElement>) => {
        if (e.key !== 'Tab' || !dialogRef.current) return;
        const focusable = getFocusable(dialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, []);

    // Backdrop click close (click on <dialog> itself, not its content)
    const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
        if (e.target === dialogRef.current) onClose();
    }, [onClose]);

    return (
        <dialog
            ref={dialogRef}
            aria-modal="true"
            aria-label={title}
            onKeyDown={handleKeyDown}
            onClick={handleBackdropClick}
            className={cn(
                // Reset <dialog> defaults
                'p-0 bg-transparent border-0 outline-none',
                // Backdrop via ::backdrop (defined in tokens.css)
                'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
                // Sizing
                'w-full mx-auto my-auto',
                SIZE_CLASSES[size],
                // Glass surface
                'rounded-card bg-white/8 backdrop-blur-3xl border border-white/10 shadow-card',
                // Motion
                'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150',
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h2
                    className={cn(
                        'text-base font-semibold tracking-tight text-white/95',
                        titleHidden && 'sr-only'
                    )}
                >
                    {title}
                </h2>
                {showCloseButton && (
                    <button
                        type="button"
                        aria-label="Close modal"
                        onClick={onClose}
                        className={cn(
                            'flex items-center justify-center rounded-inner w-8 h-8',
                            'text-white/40 hover:text-white/80 hover:bg-white/8',
                            'transition-[var(--transition-base)]',
                            'focus-visible:outline-none focus-visible:ring-2',
                            'focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
                        )}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="px-6 py-5">
                {children}
            </div>
        </dialog>
    );
}
