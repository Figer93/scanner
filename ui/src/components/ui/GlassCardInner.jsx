/**
 * Inner glass block for nested panels (e.g. inside GlassCard).
 */
import { createElement } from 'react';

export default function GlassCardInner({ children, className = '', as = 'div', ...rest }) {
  const base = 'bg-white/5 backdrop-blur-md rounded-xl';
  const cls = className ? `${base} ${className}` : base;
  return createElement(as, { className: cls, ...rest }, children);
}
