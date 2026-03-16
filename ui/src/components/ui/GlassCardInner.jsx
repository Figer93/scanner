/**
 * Inner glass block for nested panels (e.g. inside GlassCard).
 */
export default function GlassCardInner({ children, className = '', as: Component = 'div', ...rest }) {
  const base = 'bg-white/5 backdrop-blur-md rounded-xl';
  const cls = className ? `${base} ${className}` : base;
  return (
    <Component className={cls} {...rest}>
      {children}
    </Component>
  );
}
