import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import LeadsPage from './pages/leads/LeadsPage';
import LeadProfilePage from './pages/LeadProfilePage';
import CompanyDetailPage from './pages/company/CompanyDetailPage';
import ProfilePage from './pages/profile/ProfilePage';
import DBManagement from './pages/DBManagement';
import PipelinePage from './pages/PipelinePage';
import AppLayout from './components/layout/AppLayout';
import { api } from './api/client';
import { endpoints } from './api/endpoints';
import { getPageFromHash } from './constants/routes';
import { useSocketLogs } from './hooks/useSocket';
import WelcomePage from './pages/welcome/WelcomePage';

const INBOX_LAST_SEEN_KEY = 'foundlystart_inbox_last_seen_v1';

function loadLastSeenMap() {
  try {
    const raw = localStorage.getItem(INBOX_LAST_SEEN_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function parseTs(ts) {
  if (!ts) return null;
  const s = String(ts).trim();
  if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const t = Date.parse(withZone);
  return Number.isFinite(t) ? t : null;
}

const Outreach = lazy(() => import('./pages/Outreach'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function useHashRoute() {
  const [state, setState] = useState(() => getPageFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setState(getPageFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return state;
}

const THEME_STORAGE_KEY = 'foundlystart_theme';

function AppInner() {
  const { page, leadId, companyNumber, conversationLeadId } = useHashRoute();
  const [logs, setLogs, clearLogs] = useSocketLogs();
  const [userName, setUserName] = useState('User');
  const [outreachUnreadCount, setOutreachUnreadCount] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch { /* ignore */ }
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    api.get(endpoints.logs()).then((data) => {
      if (cancelled) return;
      const entries = Array.isArray(data?.entries) ? data.entries : [];
      if (entries.length === 0) return;
      setLogs((prev) => {
        const byId = new Map(entries.map((e) => [e.id, e]));
        prev.forEach((p) => {
          if (p?.id != null && !byId.has(p.id)) byId.set(p.id, p);
        });
        return [...byId.values()].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [setLogs]);

  useEffect(() => {
    let cancelled = false;
    api.get(endpoints.profile()).then((data) => {
      if (cancelled) return;
      const raw = (data?.team_members || '').toString().trim();
      if (raw) {
        const first = raw.split(',')[0].trim();
        if (first) setUserName(first);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      try {
        const data = await api.get('/api/email-inbox/summary?limit=2000');
        const rows = Array.isArray(data) ? data : [];
        const lastSeen = loadLastSeenMap();
        let unread = 0;
        for (const r of rows) {
          const leadIdNum = r && r.lead_id != null ? Number(r.lead_id) : null;
          if (!leadIdNum || !Number.isFinite(leadIdNum)) continue;
          const lastInboundAt = parseTs(r.last_inbound_at);
          if (!lastInboundAt) continue;
          const seenAt = parseTs(lastSeen[String(leadIdNum)]);
          if (!seenAt || lastInboundAt > seenAt) unread++;
        }
        if (!cancelled) setOutreachUnreadCount(unread);
      } catch {
        if (!cancelled) setOutreachUnreadCount(0);
      } finally {
        if (!cancelled) timer = setTimeout(tick, 15000);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleClearLogs = () => clearLogs();
  const handleBackToLeads = () => { window.location.hash = '#/leads'; };

  const isFindLeads = page === 'leads' && leadId == null;
  const isLeadProfile = page === 'leads' && leadId != null;
  const isCompanyDetail = page === 'company' && companyNumber;

  const activeNavId =
    isFindLeads ? 'leads'
    : page === 'profile' ? 'profile'
    : page === 'outreach' ? 'outreach'
    : page === 'db' ? 'db'
    : page === 'pipeline' ? 'pipeline'
    : 'home';

  return (
    <AppLayout
      page={page}
      activeNavId={activeNavId}
      userName={userName}
      darkMode={darkMode}
      onThemeToggle={() => setDarkMode((d) => !d)}
      navBadges={{ outreach: outreachUnreadCount }}
    >
      {page === 'home' && <Home />}
      {isFindLeads && <LeadsPage />}
      {isLeadProfile && <LeadProfilePage leadId={leadId} onBack={handleBackToLeads} />}
      {isCompanyDetail && <CompanyDetailPage companyNumber={companyNumber} onBack={handleBackToLeads} />}
      {page === 'profile' && <ProfilePage logs={logs} onClearLogs={handleClearLogs} />}
      {page === 'outreach' && (
        <Suspense fallback={<div className="p-6 text-white/70">Loading…</div>}>
          <Outreach initialConversationLeadId={conversationLeadId} />
        </Suspense>
      )}
      {page === 'db' && <DBManagement />}
      {page === 'pipeline' && <PipelinePage />}
    </AppLayout>
  );
}

function isDashboardHost(hostname) {
  if (!hostname) return true;
  const h = String(hostname).toLowerCase().trim();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  return h.startsWith('dashboard.');
}

export default function App() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const showDashboard = isDashboardHost(hostname);
  return (
    <QueryClientProvider client={queryClient}>
      {showDashboard ? <AppInner /> : <WelcomePage />}
    </QueryClientProvider>
  );
}
