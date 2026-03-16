/**
 * "← Back" link/button for sub-pages.
 */
export default function PageBack({ href = '#/', onClick, children = '← Back', className = '' }) {
  const base =
    'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/90 hover:bg-white/10 hover:border-white/20 transition-colors font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50';
  const cls = className ? `${base} ${className}` : base;
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
