import { useCallback } from 'react';
import { ArrowRight, ShieldCheck, Sparkles, Zap, Workflow, Users } from 'lucide-react';

import { GlassCard, Button } from '../../components/ui';
import ContactForm from './ContactForm';

const DASHBOARD_URL = 'https://dashboard.foundlystart.co.uk/#/';

function ScrollToContactButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById('welcome-contact');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 transition-[var(--transition-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      aria-label="Get setup help"
    >
      <Users size={15} className="text-white/45" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-white leading-tight">Get setup help</p>
        <p className="text-xs text-white/40 leading-tight mt-0.5">We’ll guide your first outreach flow</p>
      </div>
      <ArrowRight size={16} className="text-violet-300 ml-auto" aria-hidden="true" />
    </button>
  );
}

export default function WelcomePage() {
  const goToDashboard = useCallback(() => {
    window.location.href = DASHBOARD_URL;
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[7%] h-80 w-80 rounded-full bg-[var(--color-accent-glow)] blur-3xl opacity-20 motion-safe:animate-[orbFloat_10s_ease-in-out_infinite] duration-300" />
        <div className="absolute top-[18%] right-[-8%] h-96 w-96 rounded-full bg-[var(--color-accent-secondary)] blur-3xl opacity-15 motion-safe:animate-[orbFloat_14s_ease-in-out_infinite] duration-300" />
        <div className="absolute bottom-[-25%] left-[30%] h-[28rem] w-[28rem] rounded-full bg-[var(--color-accent-primary)] blur-3xl opacity-10 motion-safe:animate-[orbFloat_16s_ease-in-out_infinite] duration-300" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12),transparent_55%)] motion-safe:animate-[shimmer_6s_ease-in-out_infinite]" />
      </div>

      <main className="relative z-[1] max-w-screen-2xl mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/8 border border-white/10 shadow-glow flex items-center justify-center">
              <Sparkles size={18} className="text-violet-200" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-widest">Hyper-Glass Command Center</p>
              <h1 className="text-2xl font-semibold text-white tracking-tight">Foundly Start</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={goToDashboard} aria-label="Go to dashboard">
              Go to dashboard
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Bento hero */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 mb-10">
          <GlassCard className="p-6 md:col-span-2 xl:col-span-2">
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight leading-[1.05]">
                B2B lead discovery + outreach,
                <span className="block text-violet-200/90">done the right way.</span>
              </h2>
              <p className="text-sm text-white/50 leading-relaxed mt-4">
                Foundly Start finds newly incorporated UK businesses, enriches contacts, and helps you turn that data into
                ready-to-send outreach—while we support your setup so you’re not stuck.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-xs text-white/50 uppercase tracking-widest">
                    <Zap size={14} aria-hidden="true" />
                    Instant value
                  </div>
                  <p className="text-sm font-semibold text-white mt-2">Start in minutes</p>
                  <p className="text-xs text-white/40 mt-1">Pipeline + templates + tracking</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-xs text-white/50 uppercase tracking-widest">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Operational clarity
                  </div>
                  <p className="text-sm font-semibold text-white mt-2">Milestones that matter</p>
                  <p className="text-xs text-white/40 mt-1">Sent, opened, replied, converted</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => {
                    const el = document.getElementById('welcome-contact');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  aria-label="Start conversation"
                >
                  Talk to us
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
                <span className="text-xs text-white/40">
                  No pressure—just setup guidance.
                </span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 xl:col-span-1">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">How it works</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-violet-200">1</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Discover</p>
                  <p className="text-xs text-white/40 leading-relaxed">Companies House + Google Maps signals</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-violet-200">2</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Enrich</p>
                  <p className="text-xs text-white/40 leading-relaxed">Scrape contacts and detect email + phone</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-violet-200">3</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Outreach</p>
                  <p className="text-xs text-white/40 leading-relaxed">Score leads and generate outreach drafts</p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <ScrollToContactButton />
            </div>
          </GlassCard>

          <GlassCard className="p-6 xl:col-span-1">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">B2B support model</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Workflow size={16} className="text-violet-200" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">We help your setup</p>
                  <p className="text-xs text-white/40 leading-relaxed">Refine templates, sender, tracking + routes</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} className="text-violet-200" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">You stay in control</p>
                  <p className="text-xs text-white/40 leading-relaxed">Milestones, limits, and visibility on every step</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-violet-200" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Built for agencies</p>
                  <p className="text-xs text-white/40 leading-relaxed">Operate at scale without losing consistency</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Contact */}
        <section id="welcome-contact" className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-white/8 border border-white/10 shadow-glow flex items-center justify-center">
              <Sparkles size={18} className="text-violet-200" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-widest">Start here</p>
              <h3 className="text-2xl font-semibold text-white tracking-tight">Support, setup, and next steps</h3>
            </div>
          </div>

          <ContactForm />
        </section>

        {/* Footer */}
        <footer className="text-xs text-white/40 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>© {new Date().getFullYear()} Foundly Start</span>
            <span className="text-white/30">No cookies required. Premium by design.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

