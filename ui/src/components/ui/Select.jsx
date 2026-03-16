/**
 * Glass-style select.
 */
export default function Select({ className = '', children, ...rest }) {
  const base =
    'bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-colors cursor-pointer';
  const cls = className ? `${base} ${className}` : base;
  return (
    <select className={cls} {...rest}>
      {children}
    </select>
  );
}
