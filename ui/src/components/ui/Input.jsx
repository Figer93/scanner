/**
 * Glass-style input: bg, border, focus glow.
 */
export default function Input({
  className = '',
  type = 'text',
  ...rest
}) {
  const base =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-colors';
  const cls = className ? `${base} ${className}` : base;
  return <input type={type} className={cls} {...rest} />;
}
