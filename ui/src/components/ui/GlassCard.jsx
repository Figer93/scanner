/**
 * Outer glass card: Hyper-Glass style.
 * Use for main content blocks (Bento grid cells).
 */
import { createElement } from 'react';

export default function GlassCard({ children, className = '', as = 'div', ...rest }) {
  const base =
    'bg-white/[0.08] backdrop-blur-3xl border border-white/10 shadow-[var(--shadow-card)] rounded-[var(--radius-card)] p-6 transition-[var(--transition-base)] hover:bg-white/[0.12]';
  const cls = className ? `${base} ${className}` : base;
  return createElement(as, { className: cls, ...rest }, children);
}
