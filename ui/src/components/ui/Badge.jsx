/**
 * Status / label badge in Hyper-Glass style.
 * variant: default | success | warning | danger
 */
const variants = {
  default: 'bg-white/10 text-white/90 border-white/10',
  success: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  danger: 'bg-red-500/20 text-red-300 border-red-400/30',
};

export default function Badge({ children, variant = 'default', className = '' }) {
  const v = variants[variant] ?? variants.default;
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border';
  const cls = `${base} ${v} ${className}`.trim();
  return <span className={cls}>{children}</span>;
}
