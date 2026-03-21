/**
 * Lead action bar: Enrich, Sync, Push to CRM, Add to list, Status dropdown.
 * Also renders enrichment detail card and company detail card.
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Sparkles, Upload, ListPlus, Building2, Mail, Pencil, Star, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import { outreachConversationUrl } from '../../constants/routes';
import api from '../../api/client';
import { GlassCard, Button, Input, Select } from '../../components/ui';
import Modal from '../../components/ui/Modal';
import StatusDropdown from '../../components/StatusDropdown';
import { capitalize } from '../../lib/utils';
import { useLists } from '../../hooks/useLists';
import { useUpdateLead, useScoreLead } from '../../hooks/useLeads';
import type { Lead } from '../../hooks/useLeads';

/** Parse comma- or newline-separated string into trimmed non-empty strings. */
function parseList(value: string): string[] {
    return value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Normalize host/path for comparing website vs domain (header vs lead row). */
function normalizeWebsiteKey(raw: string | undefined): string {
    if (!raw) return '';
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] ?? '';
    return s;
}

interface CompanyActionsProps {
    lead: Lead | null;
    companyNumber: string;
    company: Record<string, unknown>;
    domainUrl: string | undefined;
    onLeadRefresh: () => void;
    onCompanyRefresh: () => void;
}

const linkCls = 'text-[var(--color-accent-secondary)] hover:opacity-90 underline text-sm break-all text-right focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded';

export default function CompanyActions({
    lead, companyNumber, company, domainUrl,
    onLeadRefresh, onCompanyRefresh,
}: CompanyActionsProps) {
    const [enriching, setEnriching] = useState(false);
    const [leadSyncing, setLeadSyncing] = useState(false);
    const [pushCrmLoading, setPushCrmLoading] = useState(false);
    const [pushCrmMessage, setPushCrmMessage] = useState<string | null>(null);
    const [addToListOpen, setAddToListOpen] = useState(false);
    const [addToListLoading, setAddToListLoading] = useState(false);
    const [addToListError, setAddToListError] = useState<string | null>(null);
    const [addToListSelectedId, setAddToListSelectedId] = useState('');
    const [addToListNewName, setAddToListNewName] = useState('');
    const [contactEditOpen, setContactEditOpen] = useState(false);
    const [contactEmails, setContactEmails] = useState('');
    const [contactPhones, setContactPhones] = useState('');
    const [scoreBreakdownOpen, setScoreBreakdownOpen] = useState(false);

    const { data: lists = [] } = useLists();
    const updateLeadMutation = useUpdateLead();
    const scoreLeadMutation = useScoreLead();

    const handleEnrich = useCallback(async () => {
        if (!lead?.id || enriching) return;
        setEnriching(true);
        try { await api.post(`/api/leads/${lead.id}/enrich`, {}); onLeadRefresh(); }
        finally { setEnriching(false); }
    }, [lead?.id, enriching, onLeadRefresh]);

    const handleLeadSync = useCallback(async () => {
        if (!lead?.id || leadSyncing) return;
        setLeadSyncing(true);
        try {
            await api.post(`/api/leads/${lead.id}/sync`, {});
            onLeadRefresh();
            onCompanyRefresh();
        } finally { setLeadSyncing(false); }
    }, [lead?.id, leadSyncing, onLeadRefresh, onCompanyRefresh]);

    const handlePushCrm = useCallback(async (provider: string) => {
        if (!lead?.id || pushCrmLoading) return;
        setPushCrmMessage(null);
        setPushCrmLoading(true);
        try {
            const data: { ok?: boolean; error?: string } = await api.post(`/api/leads/${lead.id}/push-crm`, { provider });
            setPushCrmMessage(data?.ok ? `Pushed to ${provider}` : (data?.error || 'Push failed'));
        } catch (err: unknown) {
            setPushCrmMessage(err instanceof Error ? err.message : 'Push failed');
        } finally { setPushCrmLoading(false); }
    }, [lead?.id, pushCrmLoading]);

    const handleStatusChange = useCallback(async (newStatus: string) => {
        if (!lead?.id) return;
        try { await api.patch(`/api/leads/${lead.id}`, { status: newStatus }); onLeadRefresh(); }
        catch { /* error handled by parent */ }
    }, [lead?.id, onLeadRefresh]);

    const handleToggleConverted = useCallback(async () => {
        if (!lead?.id) return;
        const isConverted = Boolean(lead.converted_at);
        try {
            await api.patch(`/api/leads/${lead.id}`, { converted: !isConverted });
            onLeadRefresh();
        } catch {
            // ignore
        }
    }, [lead?.id, lead?.converted_at, onLeadRefresh]);

    const handleAddToList = useCallback(async () => {
        const listId = addToListNewName.trim() ? null : parseInt(addToListSelectedId, 10);
        if (!listId && !addToListNewName.trim()) { setAddToListError('Choose a list or enter a new list name.'); return; }
        setAddToListLoading(true);
        setAddToListError(null);
        try {
            let targetId = listId;
            if (addToListNewName.trim()) {
                const created: { id: number } = await api.post('/api/lists', { name: addToListNewName.trim() });
                targetId = created.id;
            }
            if (!targetId) { setAddToListError('Could not create or select list.'); setAddToListLoading(false); return; }
            await api.post('/api/leads/save-to-list', { listId: targetId, companyNumbers: [companyNumber] });
            setAddToListOpen(false);
            onLeadRefresh();
        } catch (err: unknown) {
            setAddToListError(err instanceof Error ? err.message : 'Failed to add to list');
        } finally { setAddToListLoading(false); }
    }, [addToListSelectedId, addToListNewName, companyNumber, onLeadRefresh]);

    const openModal = useCallback(() => {
        setAddToListError(null);
        setAddToListSelectedId('');
        setAddToListNewName('');
        setAddToListOpen(true);
    }, []);

    const openContactEdit = useCallback(() => {
        if (lead) {
            setContactEmails(Array.isArray(lead.emails) ? lead.emails.join('\n') : (lead.emails || ''));
            setContactPhones(Array.isArray(lead.phones) ? lead.phones.join('\n') : (lead.phones || ''));
        }
        setContactEditOpen(true);
    }, [lead]);

    const saveContactEdit = useCallback(async () => {
        if (!lead?.id) return;
        const emails = parseList(contactEmails);
        const phones = parseList(contactPhones);
        try {
            await updateLeadMutation.mutateAsync({
                id: lead.id,
                payload: { emails, phones },
            });
            setContactEditOpen(false);
            onLeadRefresh();
        } catch {
            // Error surfaced by mutation / toast if present
        }
    }, [lead?.id, contactEmails, contactPhones, updateLeadMutation, onLeadRefresh]);

    const leadWebsite = lead?.website ? String(lead.website) : '';
    const domainStr = domainUrl ? String(domainUrl) : '';
    const websiteRowDifferent =
        Boolean(lead) &&
        (normalizeWebsiteKey(leadWebsite) !== normalizeWebsiteKey(domainStr) || (!domainStr && leadWebsite));

    return (
        <>
            {/* Action bar — full width in bento grid */}
            <div className="col-span-full flex flex-wrap items-center gap-2">
                {lead ? (
                    <>
                        <Button variant="primary" size="sm" onClick={handleEnrich} disabled={enriching} title="Find LinkedIn and guess email (OSINT)">
                            <Sparkles size={14} className="mr-1" aria-hidden="true" />{enriching ? 'Enriching…' : 'Enrich'}
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleLeadSync} disabled={leadSyncing} title="Re-fetch website, contacts and enrichment">
                            <RefreshCw size={14} className="mr-1" aria-hidden="true" />{leadSyncing ? 'Syncing…' : 'Sync'}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => { window.location.hash = outreachConversationUrl(lead.id); }}
                            title="Open email conversation in Outreach"
                            aria-label="Open email conversation"
                        >
                            <Mail size={14} className="mr-1" aria-hidden="true" />Email
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => scoreLeadMutation.mutate(lead.id, { onSuccess: onLeadRefresh })}
                            disabled={scoreLeadMutation.isPending}
                            title="AI score this lead (1–10) and show breakdown"
                            aria-label="Score lead"
                        >
                            <Star size={14} className="mr-1" aria-hidden="true" />
                            {scoreLeadMutation.isPending ? 'Scoring…' : 'Score'}
                        </Button>
                        <span className="text-xs text-[var(--color-text-secondary)] mr-1">Push to CRM:</span>
                        {['hubspot', 'pipedrive', 'salesforce'].map((provider) => (
                            <Button key={provider} variant="secondary" size="sm" onClick={() => handlePushCrm(provider)} disabled={pushCrmLoading} title={`Push to ${capitalize(provider)}`}>
                                <Upload size={14} className="mr-1" aria-hidden="true" />{pushCrmLoading ? '…' : capitalize(provider)}
                            </Button>
                        ))}
                        {pushCrmMessage && (
                            <span className={`text-xs w-full sm:w-auto ${pushCrmMessage.startsWith('Pushed') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`} role="status">{pushCrmMessage}</span>
                        )}
                        <Button variant="secondary" size="sm" onClick={openModal} title="Add this lead to a list">
                            <ListPlus size={14} className="mr-1" aria-hidden="true" />Add to list
                        </Button>
                        <Button
                            variant={lead.converted_at ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={handleToggleConverted}
                            title={lead.converted_at ? 'Unmark converted' : 'Mark converted'}
                            aria-label={lead.converted_at ? 'Unmark converted' : 'Mark converted'}
                        >
                            <TrendingUp size={14} className="mr-1" aria-hidden="true" />
                            {lead.converted_at ? 'Converted' : 'Mark converted'}
                        </Button>
                    </>
                ) : (
                    <Button variant="secondary" size="sm" onClick={openModal} title="Add this company to a list">
                        <ListPlus size={14} className="mr-1" aria-hidden="true" />Add to list
                    </Button>
                )}
            </div>

            {/* Company detail card — span 2 when lead exists (right col = Contact), else full width */}
            <div className={lead ? 'md:col-span-2 xl:col-span-2' : 'md:col-span-2 xl:col-span-3'}>
                <GlassCard>
                    <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 text-[var(--color-text-primary)]">
                        <Building2 size={16} className="text-[var(--color-text-muted)]" aria-hidden="true" />Company
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 leading-relaxed">
                        <div className="flex justify-between items-baseline gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">Source</span><span className="text-sm text-[var(--color-text-primary)] text-right truncate">{lead?.source || (company.source_metadata ? 'companies_house' : '—')}</span></div>
                        {websiteRowDifferent && (
                            <div className="flex justify-between items-baseline gap-2 min-w-0 sm:col-span-2">
                                <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Website (lead)</span>
                                {(leadWebsite || domainStr) ? (
                                    <a
                                        href={(leadWebsite || domainStr).startsWith('http') ? (leadWebsite || domainStr) : `https://${leadWebsite || domainStr}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${linkCls} truncate block text-right`}
                                    >
                                        {leadWebsite || domainStr}
                                    </a>
                                ) : (
                                    <span className="text-sm text-[var(--color-text-muted)] text-right">—</span>
                                )}
                            </div>
                        )}
                        {lead && (
                            <div className="flex justify-between items-center gap-2 min-w-0 sm:col-span-2">
                                <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Lead status</span>
                                <StatusDropdown value={lead.status || 'New'} onChange={handleStatusChange} ariaLabel="Change lead status" />
                            </div>
                        )}
                        {lead && lead.score != null && (
                            <div className="sm:col-span-2 flex flex-col gap-2">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Score</span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-inner)] text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                        <Star size={12} className="opacity-80" aria-hidden="true" />
                                        {lead.score}/10
                                    </span>
                                </div>
                                {lead.score_breakdown && (
                                    <div className="rounded-[var(--radius-inner)] bg-white/5 border border-white/10 overflow-hidden">
                                        <button
                                            type="button"
                                            className="flex items-center justify-between w-full py-2 px-3 text-left text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
                                            onClick={() => setScoreBreakdownOpen((o) => !o)}
                                            aria-expanded={scoreBreakdownOpen}
                                        >
                                            <span>Score breakdown</span>
                                            {scoreBreakdownOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                                        </button>
                                        {scoreBreakdownOpen && (
                                            <div className="px-3 pb-3 pt-0 border-t border-white/10" role="region" aria-label="Score breakdown details">
                                                <p className="text-xs text-[var(--color-text-muted)] mb-2 mt-2">
                                                    AI Score: {lead.score_breakdown.scoreOutOf10}/10
                                                </p>
                                                <div className="h-px bg-white/10 mb-2" aria-hidden="true" />
                                                <ul className="space-y-1 text-xs font-mono">
                                                    {lead.score_breakdown.factors.map((f) => (
                                                        <li key={f.key} className="flex justify-between gap-2 text-[var(--color-text-primary)]">
                                                            <span>{f.earned ? '✓' : '✗'} {f.label}</span>
                                                            <span className="text-[var(--color-text-secondary)]">{f.earned ? `+${f.points}` : '0'}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <div className="h-px bg-white/10 my-2" aria-hidden="true" />
                                                <p className="text-xs text-[var(--color-text-secondary)]">
                                                    Total: {lead.score_breakdown.totalPoints}/100 → {lead.score_breakdown.scoreOutOf10}/10
                                                </p>
                                                {lead.score_breakdown.reason && (
                                                    <p className="text-xs text-[var(--color-text-muted)] mt-1 italic">{lead.score_breakdown.reason}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </GlassCard>
            </div>

            {/* Contact & enrichment — single card to fill right column and avoid vertical empty space */}
            {lead && (
                <div className="xl:col-span-1 flex flex-col gap-0">
                    <GlassCard className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2 text-[var(--color-text-primary)]">
                                <Mail size={16} className="text-[var(--color-text-muted)]" aria-hidden="true" />
                                Contact
                            </h2>
                            <Button variant="secondary" size="sm" onClick={openContactEdit} title="Add or edit contact email and phone">
                                <Pencil size={14} className="mr-1" aria-hidden="true" />Add contact
                            </Button>
                        </div>
                        <div className="space-y-1.5 leading-relaxed text-sm">
                            <div className="flex justify-between gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">Email</span><span className="text-[var(--color-text-primary)] text-right break-all truncate" title={lead.emails?.length ? lead.emails[0] : undefined}>{lead.emails?.length ? lead.emails[0] : '—'}{lead.emails && lead.emails.length > 1 ? <span className="text-[var(--color-text-muted)] ml-1 shrink-0">(+{lead.emails.length - 1})</span> : null}</span></div>
                            <div className="flex justify-between gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">Phone</span><span className="text-[var(--color-text-primary)] text-right truncate">{lead.phones?.length ? lead.phones.join(', ') : '—'}</span></div>
                        </div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2 text-[var(--color-text-muted)]">Enrichment</h3>
                        <div className="space-y-1.5 leading-relaxed text-sm flex-1">
                            <div className="flex justify-between gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">LinkedIn</span>{lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className={`${linkCls} truncate block text-right`}>Link</a> : <span className="text-[var(--color-text-muted)] text-right">Not found</span>}</div>
                            <div className="flex justify-between gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">Predicted email</span><span className="font-mono text-[var(--color-text-primary)] text-right truncate" title={lead.predicted_email || ''}>{lead.predicted_email || 'Not found'}</span></div>
                            {lead.enrichment_status && <div className="flex justify-between gap-2 min-w-0"><span className="text-xs text-[var(--color-text-secondary)] shrink-0">Status</span><span className="text-[var(--color-text-primary)] text-right">{lead.enrichment_status}</span></div>}
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* Add to list modal */}
            <Modal open={addToListOpen} onClose={() => !addToListLoading && setAddToListOpen(false)} title="Add to list" size="md">
                <p className="text-sm text-white/70 mb-4">Add this company to a list to enable Enrich, Sync, and Push to CRM.</p>
                {addToListError && (
                    <div className="mb-4 p-3 rounded-inner bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">{addToListError}</div>
                )}
                <div className="space-y-2 mb-4">
                    <label htmlFor="cd-add-list" className="block text-sm text-white/70">Existing list</label>
                    <Select id="cd-add-list" value={addToListSelectedId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddToListSelectedId(e.target.value)} disabled={addToListLoading}>
                        <option value="">— Select list —</option>
                        {lists.map((list) => (
                            <option key={list.id} value={String(list.id)}>{list.name} {list.lead_count != null ? `(${list.lead_count})` : ''}</option>
                        ))}
                    </Select>
                </div>
                <div className="space-y-2 mb-6">
                    <label htmlFor="cd-new-list" className="block text-sm text-white/70">Or create new list</label>
                    <Input id="cd-new-list" placeholder="List name" value={addToListNewName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddToListNewName(e.target.value)} disabled={addToListLoading} />
                </div>
                <div className="flex gap-3 justify-end">
                    <Button variant="secondary" onClick={() => !addToListLoading && setAddToListOpen(false)} disabled={addToListLoading}>Cancel</Button>
                    <Button variant="primary" onClick={handleAddToList} disabled={addToListLoading || (!addToListSelectedId && !addToListNewName.trim())}>{addToListLoading ? 'Saving…' : 'Add to list'}</Button>
                </div>
            </Modal>

            {/* Edit contact (email & phone) modal */}
            <Modal
                open={contactEditOpen}
                onClose={() => !updateLeadMutation.isPending && setContactEditOpen(false)}
                title="Edit contact"
                size="md"
            >
                <p className="text-sm text-white/70 mb-4">Set or update email and phone for this company. One per line or comma-separated.</p>
                <div className="space-y-2 mb-4">
                    <label htmlFor="contact-emails" className="block text-sm text-white/70">Emails</label>
                    <textarea
                        id="contact-emails"
                        className="w-full min-h-[80px] px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)]"
                        placeholder="email@example.com"
                        value={contactEmails}
                        onChange={(e) => setContactEmails(e.target.value)}
                        disabled={updateLeadMutation.isPending}
                        rows={3}
                    />
                </div>
                <div className="space-y-2 mb-6">
                    <label htmlFor="contact-phones" className="block text-sm text-white/70">Phone numbers</label>
                    <textarea
                        id="contact-phones"
                        className="w-full min-h-[80px] px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)]"
                        placeholder="+44 20 7123 4567"
                        value={contactPhones}
                        onChange={(e) => setContactPhones(e.target.value)}
                        disabled={updateLeadMutation.isPending}
                        rows={3}
                    />
                </div>
                <div className="flex gap-3 justify-end">
                    <Button variant="secondary" onClick={() => !updateLeadMutation.isPending && setContactEditOpen(false)} disabled={updateLeadMutation.isPending}>Cancel</Button>
                    <Button variant="primary" onClick={saveContactEdit} disabled={updateLeadMutation.isPending}>
                        {updateLeadMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </Modal>
        </>
    );
}
