import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import LeadsPage from './pages/leads/LeadsPage';
import LeadProfilePage from './pages/LeadProfilePage';
import CompanyDetailPage from './pages/company/CompanyDetailPage';
import ProfilePage from './pages/profile/ProfilePage';
import Logs from './pages/Logs';
import Analytics from './pages/Analytics';
import DBManagement from './pages/DBManagement';
import Earnings from './pages/Earnings';
import AppLayout from './components/layout/AppLayout';
import { api } from './api/client';
import { endpoints } from './api/endpoints';
import { getPageFromHash } from './constants/routes';
import { useSocketLogs } from './hooks/useSocket';

const KanbanPage = lazy(() => import('./pages/kanban/KanbanPage'));
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

const THEME_STORAGE_KEY = 'chscanner_theme';

function AppInner() {
  const { page, leadId, companyNumber, conversationLeadId } = useHashRoute();
  const [logs, setLogs, clearLogs] = useSocketLogs();
  const [userName, setUserName] = useState('User');
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

  const handleClearLogs = () => clearLogs();
  const handleBackToLeads = () => { window.location.hash = '#/leads'; };

  const isFindLeads = page === 'leads' && leadId == null;
  const isLeadProfile = page === 'leads' && leadId != null;
  const isCompanyDetail = page === 'company' && companyNumber;

  const activeNavId =
    isFindLeads ? 'leads'
    : page === 'kanban' ? 'kanban'
    : page === 'profile' ? 'profile'
    : page === 'analytics' ? 'analytics'
    : page === 'earnings' ? 'earnings'
    : page === 'outreach' ? 'outreach'
    : page === 'db' ? 'db'
    : page === 'logs' ? 'logs'
    : 'home';

  return (
    <AppLayout
      page={page}
      activeNavId={activeNavId}
      userName={userName}
      darkMode={darkMode}
      onThemeToggle={() => setDarkMode((d) => !d)}
    >
      {page === 'home' && <Home />}
      {isFindLeads && <LeadsPage />}
      {isLeadProfile && <LeadProfilePage leadId={leadId} onBack={handleBackToLeads} />}
      {isCompanyDetail && <CompanyDetailPage companyNumber={companyNumber} onBack={handleBackToLeads} />}
      {page === 'kanban' && (
        <Suspense fallback={<div className="p-6 text-white/70">Loading…</div>}>
          <KanbanPage />
        </Suspense>
      )}
      {page === 'profile' && <ProfilePage logs={logs} onClearLogs={handleClearLogs} />}
      {page === 'analytics' && <Analytics />}
      {page === 'earnings' && <Earnings />}
      {page === 'outreach' && (
        <Suspense fallback={<div className="p-6 text-white/70">Loading…</div>}>
          <Outreach initialConversationLeadId={conversationLeadId} />
        </Suspense>
      )}
      {page === 'db' && <DBManagement />}
      {page === 'logs' && <Logs logs={logs} onClearLogs={handleClearLogs} />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
