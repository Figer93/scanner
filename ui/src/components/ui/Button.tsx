/**
 * Button — primary, secondary, danger, ghost variants.
 * All variants include a visible focus ring for keyboard accessibility.
 */

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

const variants: Record<string, string> = {
    primary:   `bg-[var(--color-accent-primary)] hover:opacity-90 text-white border-transparent shadow-glow ${FOCUS_RING}`,
    secondary: `bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 ${FOCUS_RING}`,
    danger:    `bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 hover:border-red-400/50 ${FOCUS_RING}`,
    ghost:     `bg-transparent hover:bg-white/5 text-white/90 border border-transparent ${FOCUS_RING}`,
};

const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export default function Button({
    children,
    variant = 'secondary',
    size = 'md',
    type = 'button',
    disabled = false,
    className = '',
    ...rest
}: ButtonProps) {
    const v = variants[variant] ?? variants['secondary']!;
    const s = sizes[size] ?? sizes['md']!;
    const disabledCls = disabled ? 'opacity-50 cursor-not-allowed' : '';
    const cls = `inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors ${v} ${s} ${disabledCls} ${className}`.trim();
    return (
        <button type={type} className={cls} disabled={disabled} {...rest}>
            {children}
        </button>
    );
}
