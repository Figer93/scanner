/**
 * Hyper-Glass app shell: topbar + sidebar + main content.
 */
const NAV_ITEMS = [
  { id: 'home', hash: '#/', label: 'Dashboard', icon: '◉' },
  { id: 'leads', hash: '#/leads', label: 'Find Leads', icon: '🔍', ariaDescription: 'Enriched leads and discovery' },
  { id: 'kanban', hash: '#/kanban', label: 'Kanban', icon: '📋' },
  { id: 'analytics', hash: '#/analytics', label: 'Analytics', icon: '📊' },
  { id: 'earnings', hash: '#/earnings', label: 'Earnings', icon: '£' },
  { id: 'outreach', hash: '#/outreach', label: 'Outreach', icon: '✉' },
  { id: 'db', hash: '#/db', label: 'DB Management', icon: '🗄' },
  { id: 'logs', hash: '#/logs', label: 'Logs', icon: '📜' },
  { id: 'profile', hash: '#/profile', label: 'Profile', icon: '⚙' },
];

export default function AppLayout({
  page,
  activeNavId,
  userName = 'User',
  darkMode = true,
  onThemeToggle,
  children,
}) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Topbar */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-5 bg-white/10 backdrop-blur-3xl border-b border-white/10">
        <div className="flex items-center gap-5">
          <a
            href="#/"
            className="text-[15px] font-semibold text-white hover:text-indigo-300 transition-colors tracking-tight"
          >
            CHScanner
          </a>
          {page !== 'home' && (
            <a
              href="#/"
              className="text-sm font-medium text-white/70 hover:text-indigo-300 transition-colors"
              aria-label="Back to home"
            >
              ← Home
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-white/90">
          <button
            type="button"
            onClick={onThemeToggle}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {darkMode ? '☀' : '☽'}
          </button>
          <span
            className="w-7 h-7 rounded-full bg-white/10 border border-white/10"
            aria-hidden
          />
          <span className="font-medium">{userName}</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav
          className="w-[260px] flex-shrink-0 flex flex-col gap-0.5 py-4 px-2 bg-white/10 backdrop-blur-3xl border-r border-white/10"
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeNavId === item.id;
            return (
              <a
                key={item.id}
                href={item.hash}
                className={`
                  flex items-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-indigo-500/20 text-indigo-300 border-l-2 border-indigo-400 shadow-glow'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                  }
                `}
                aria-description={item.ariaDescription ?? undefined}
              >
                <span className="text-base opacity-90" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
