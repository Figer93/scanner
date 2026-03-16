/**
 * Outer glass card: Hyper-Glass style.
 * Use for main content blocks (Bento grid cells).
 */
export default function GlassCard({ children, className = '', as: Component = 'div', ...rest }) {
  const base =
    'bg-white/[0.08] backdrop-blur-3xl border border-white/10 shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6 transition-[var(--transition-base)] hover:bg-white/[0.12]';
  const cls = className ? `${base} ${className}` : base;
  return (
    <Component className={cls} {...rest}>
      {children}
    </Component>
  );
}
