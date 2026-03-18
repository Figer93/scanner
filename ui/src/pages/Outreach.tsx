/**
 * Outreach — email templates, sent message log, and follow-up sequences.
 */

import { useState, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, Mail, Eye, Send, ListOrdered, Users, MessageCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { GlassCard, Button, Input, Select } from '../components/ui';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { formatDateTime } from '../lib/utils';
import { useLists } from '../hooks/useLists';
import { useLeads } from '../hooks/useLeads';
import LeadEmailConversation from './company/LeadEmailConversation';

interface EmailTemplate {
    id: number;
    name: string;
    subject: string;
    body: string;
    created_at: string;
    updated_at: string;
}

interface EmailLog {
    id: number;
    lead_id: number;
    company_name?: string;
    direction: string;
    status: string;
    sent_at: string;
}

interface PreviewData {
    subject: string;
    body: string;
    unresolvedVars: string[];
}

interface SequenceStep {
    id: number;
    sequence_id: number;
    step_number: number;
    template_id: number;
    delay_days: number;
    condition: string;
    template_name: string | null;
}

interface Sequence {
    id: number;
    name: string;
    created_at: string;
    active_enrolments: number;
    steps?: SequenceStep[];
}

const SEQUENCE_CONDITIONS = [
    { value: 'always', label: 'Always send' },
    { value: 'not_opened', label: 'Not opened' },
    { value: 'opened_not_replied', label: 'Opened but not replied' },
] as const;

function MarkRepliedButton({ leadId, onSuccess }: { leadId: number; onSuccess: () => void }) {
    const mutation = useMutation({
        mutationFn: () => api.post('/api/webhooks/brevo/test', { event: 'replied', leadId }),
        onSuccess: () => { onSuccess(); },
    });
    return (
        <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="text-xs text-violet-300 hover:text-violet-200 underline disabled:opacity-50"
        >
            {mutation.isPending ? 'Updating…' : 'Mark as replied'}
        </button>
    );
}

interface OutreachProps {
    /** When set, open Conversations tab and select this lead (from e.g. #/outreach?conversation=123). */
    initialConversationLeadId?: string | null;
}

export default function Outreach({ initialConversationLeadId = null }: OutreachProps) {
    const queryClient = useQueryClient();
    const { data: lists = [] } = useLists();
    const { data: leads = [] } = useLeads();
    const [listIdFilter, setListIdFilter] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formName, setFormName] = useState('');
    const [formSubject, setFormSubject] = useState('');
    const [formBody, setFormBody] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
    const [previewLeadId, setPreviewLeadId] = useState<string>('');
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [testEmail, setTestEmail] = useState('');

    const [activeTab, setActiveTab] = useState<'templates' | 'sent' | 'sequences' | 'conversations'>('conversations');
    const [conversationLeadId, setConversationLeadId] = useState<string>('');
    const [newSequenceName, setNewSequenceName] = useState('');
    const [newSequenceModalOpen, setNewSequenceModalOpen] = useState(false);
    const [addStepSequenceId, setAddStepSequenceId] = useState<number | null>(null);
    const [addStepTemplateId, setAddStepTemplateId] = useState('');
    const [addStepDelayDays, setAddStepDelayDays] = useState(3);
    const [addStepCondition, setAddStepCondition] = useState<string>('not_opened');
    const [addStepModalOpen, setAddStepModalOpen] = useState(false);
    const [enrolSequenceId, setEnrolSequenceId] = useState<number | null>(null);
    const [enrolListId, setEnrolListId] = useState('');
    const [enrolModalOpen, setEnrolModalOpen] = useState(false);

    // When navigating from company details with ?conversation=leadId, open Conversations tab and select that lead
    useEffect(() => {
        if (initialConversationLeadId) {
            setActiveTab('conversations');
            setConversationLeadId(initialConversationLeadId);
        }
    }, [initialConversationLeadId]);

    const { data: templates = [], isLoading: loadingTemplates } = useQuery<EmailTemplate[]>({
        queryKey: ['email-templates'],
        queryFn: async () => { const d: EmailTemplate[] = await api.get('/api/email-templates'); return Array.isArray(d) ? d : []; },
        staleTime: 30_000,
    });

    const { data: logs = [], isLoading: loadingLogs } = useQuery<EmailLog[]>({
        queryKey: ['email-logs', listIdFilter],
        queryFn: async () => {
            const params = new URLSearchParams({ limit: '100' });
            if (listIdFilter) params.set('listId', listIdFilter);
            const d: EmailLog[] = await api.get(`/api/email-logs?${params}`);
            return Array.isArray(d) ? d : [];
        },
        staleTime: 30_000,
    });

    const { data: sequences = [], isLoading: loadingSequences } = useQuery<Sequence[]>({
        queryKey: ['sequences'],
        queryFn: async () => {
            const d: Sequence[] = await api.get('/api/sequences?steps=1');
            return Array.isArray(d) ? d : [];
        },
        staleTime: 30_000,
        enabled: activeTab === 'sequences',
    });

    const createSequenceMutation = useMutation({
        mutationFn: (name: string) => api.post('/api/sequences', { name }),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['sequences'] }); setNewSequenceModalOpen(false); setNewSequenceName(''); },
    });
    const addStepMutation = useMutation({
        mutationFn: ({ seqId, payload }: { seqId: number; payload: { step_number: number; template_id: number; delay_days: number; condition: string } }) =>
            api.post(`/api/sequences/${seqId}/steps`, payload),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['sequences'] }); setAddStepModalOpen(false); setAddStepSequenceId(null); },
    });
    const enrolMutation = useMutation({
        mutationFn: ({ seqId, listId }: { seqId: number; listId: number }) => api.post(`/api/sequences/${seqId}/enrol`, { listId }),
        onSuccess: (_, { seqId }) => { void queryClient.invalidateQueries({ queryKey: ['sequences'] }); setEnrolModalOpen(false); setEnrolSequenceId(null); setEnrolListId(''); },
    });

    const saveMutation = useMutation({
        mutationFn: (payload: { name: string; subject: string; body: string }) =>
            editingId
                ? api.patch(`/api/email-templates/${editingId}`, payload)
                : api.post('/api/email-templates', payload),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['email-templates'] }); setModalOpen(false); },
        onError: (e: unknown) => setSaveError(e instanceof Error ? e.message : 'Save failed'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => api.delete(`/api/email-templates/${id}`),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['email-templates'] }),
    });

    const openCreate = useCallback(() => {
        setEditingId(null);
        setFormName('');
        setFormSubject('');
        setFormBody('');
        setSaveError(null);
        setModalOpen(true);
    }, []);

    const openEdit = useCallback((t: EmailTemplate) => {
        setEditingId(t.id);
        setFormName(t.name || '');
        setFormSubject(t.subject || '');
        setFormBody(t.body || '');
        setSaveError(null);
        setModalOpen(true);
    }, []);

    const handleSave = useCallback(() => {
        if (!formName.trim() || !formSubject.trim()) { setSaveError('Name and subject are required.'); return; }
        setSaveError(null);
        saveMutation.mutate({ name: formName.trim(), subject: formSubject.trim(), body: formBody });
    }, [formName, formSubject, formBody, saveMutation]);

    const handleDelete = useCallback((id: number) => {
        if (!window.confirm('Delete this template?')) return;
        deleteMutation.mutate(id);
    }, [deleteMutation]);

    const openPreview = useCallback((t: EmailTemplate) => {
        setPreviewTemplate(t);
        setPreviewLeadId('');
        setPreviewData(null);
        setTestEmail('');
        setPreviewOpen(true);
    }, []);

    useEffect(() => {
        if (!previewTemplate || !previewLeadId) {
            setPreviewData(null);
            return;
        }
        const leadId = parseInt(previewLeadId, 10);
        if (Number.isNaN(leadId)) return;
        let cancelled = false;
        setPreviewLoading(true);
        api.get<PreviewData>(`/api/email-templates/${previewTemplate.id}/preview?leadId=${leadId}`)
            .then((data) => { if (!cancelled) setPreviewData(data); })
            .catch(() => { if (!cancelled) setPreviewData(null); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; };
    }, [previewTemplate?.id, previewLeadId]);

    const sendTestMutation = useMutation({
        mutationFn: ({ templateId, leadId, toEmail }: { templateId: number; leadId: number; toEmail: string }) =>
            api.post(`/api/email-templates/${templateId}/send-test`, { toEmail, leadId }),
        onSuccess: () => {
            setPreviewOpen(false);
            setPreviewTemplate(null);
            setPreviewLeadId('');
            setPreviewData(null);
        },
    });

    const sendToLeadMutation = useMutation({
        mutationFn: ({ templateId, leadId }: { templateId: number; leadId: number }) =>
            api.post(`/api/email-templates/${templateId}/send-to-lead`, { leadId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['email-logs'] });
            setPreviewOpen(false);
            setPreviewTemplate(null);
            setPreviewLeadId('');
            setPreviewData(null);
        },
    });

    const handleSendTest = useCallback(() => {
        if (!previewTemplate || !previewLeadId || !testEmail.trim()) return;
        const leadId = parseInt(previewLeadId, 10);
        if (Number.isNaN(leadId)) return;
        sendTestMutation.mutate({ templateId: previewTemplate.id, leadId, toEmail: testEmail.trim() });
    }, [previewTemplate, previewLeadId, testEmail, sendTestMutation]);

    const previewLead = previewLeadId ? leads.find((l) => l.id === parseInt(previewLeadId, 10)) : null;
    const leadContactEmail = (() => {
        const raw = previewLead?.emails?.[0];
        if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
        const t = raw.trim().toLowerCase();
        if (t === 'not found' || t === 'unknown') return null;
        return raw.trim();
    })();

    const handleSendToLead = useCallback(() => {
        if (!previewTemplate || !previewLeadId || !leadContactEmail || sendToLeadMutation.isPending) return;
        const leadId = parseInt(previewLeadId, 10);
        if (Number.isNaN(leadId)) return;
        sendToLeadMutation.mutate({ templateId: previewTemplate.id, leadId });
    }, [previewTemplate, previewLeadId, leadContactEmail, sendToLeadMutation]);

    return (
        <div className="space-y-6 w-full">
            <nav className="flex gap-2 border-b border-white/10 pb-2" aria-label="Outreach sections">
                <button
                    type="button"
                    onClick={() => setActiveTab('conversations')}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent ${activeTab === 'conversations' ? 'bg-white/12 text-white border border-white/10 border-b-0' : 'text-white/60 hover:text-white/80 hover:bg-white/5'}`}
                    aria-current={activeTab === 'conversations' ? 'true' : undefined}
                >
                    <MessageCircle size={16} className="inline-block mr-1.5 align-middle" aria-hidden="true" />Conversations
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('templates')}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent ${activeTab === 'templates' ? 'bg-white/12 text-white border border-white/10 border-b-0' : 'text-white/60 hover:text-white/80 hover:bg-white/5'}`}
                    aria-current={activeTab === 'templates' ? 'true' : undefined}
                >
                    <Mail size={16} className="inline-block mr-1.5 align-middle" aria-hidden="true" />Templates
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('sent')}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent ${activeTab === 'sent' ? 'bg-white/12 text-white border border-white/10 border-b-0' : 'text-white/60 hover:text-white/80 hover:bg-white/5'}`}
                    aria-current={activeTab === 'sent' ? 'true' : undefined}
                >
                    Sent messages
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('sequences')}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-[var(--transition-base)] focus-visible:ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent ${activeTab === 'sequences' ? 'bg-white/12 text-white border border-white/10 border-b-0' : 'text-white/60 hover:text-white/80 hover:bg-white/5'}`}
                    aria-current={activeTab === 'sequences' ? 'true' : undefined}
                >
                    <ListOrdered size={16} className="inline-block mr-1.5 align-middle" aria-hidden="true" />Sequences
                </button>
            </nav>

            {activeTab === 'templates' && (
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Mail size={18} className="text-white/50" aria-hidden="true" />Email templates
                    </h2>
                    <Button variant="primary" onClick={openCreate}>
                        <Plus size={14} className="mr-1" aria-hidden="true" />New template
                    </Button>
                </div>
                {loadingTemplates ? (
                    <p className="text-white/60 text-sm">Loading templates…</p>
                ) : templates.length === 0 ? (
                    <EmptyState icon={Mail} title="No templates yet" description="Create one to use when sending emails." compact />
                ) : (
                    <ul className="space-y-2">
                        {templates.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                <div>
                                    <span className="font-medium text-white">{t.name}</span>
                                    <span className="text-sm text-white/60 ml-2">{t.subject}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => openPreview(t)} aria-label={`Preview ${t.name}`}>
                                        <Eye size={13} aria-hidden="true" />Preview
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                                        <Pencil size={13} aria-hidden="true" />Edit
                                    </Button>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(t.id)}>
                                        <Trash2 size={13} aria-hidden="true" />Delete
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </GlassCard>
            )}

            {activeTab === 'sent' && (
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-white">Sent messages</h2>
                    <Select className="min-w-[180px]" value={listIdFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setListIdFilter(e.target.value)} aria-label="Filter by list">
                        <option value="">All lists</option>
                        {lists.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                    </Select>
                </div>
                {loadingLogs ? (
                    <p className="text-white/60 text-sm">Loading…</p>
                ) : logs.length === 0 ? (
                    <EmptyState icon={Mail} title="No sent messages yet" description="Emails sent via Brevo will appear here when logged." compact />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                        <table className="w-full text-sm" aria-label="Sent email log">
                            <caption className="sr-only">Sent email messages</caption>
                            <thead>
                                <tr>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Date</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Lead / Company</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Direction</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Status</th>
                                    <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase bg-white/5 border-b border-white/10">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((row) => (
                                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-2.5 px-4 text-white/80">{formatDateTime(row.sent_at)}</td>
                                        <td className="py-2.5 px-4 text-white/80">{row.company_name || `Lead #${row.lead_id}`}</td>
                                        <td className="py-2.5 px-4 text-white/70">{row.direction || 'outbound'}</td>
                                        <td className="py-2.5 px-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${(row.status || 'sent').toLowerCase() === 'sent' ? 'bg-emerald-500/20 text-emerald-300' : (row.status || 'sent').toLowerCase() === 'replied' ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-white/70'}`}>{row.status || 'sent'}</span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            {(row.status || 'sent').toLowerCase() !== 'replied' && (
                                                <MarkRepliedButton leadId={row.lead_id} onSuccess={() => { void queryClient.invalidateQueries({ queryKey: ['email-logs'] }); }} />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>
            )}

            {activeTab === 'sequences' && (
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ListOrdered size={18} className="text-white/50" aria-hidden="true" />Follow-up sequences
                    </h2>
                    <Button variant="primary" onClick={() => { setNewSequenceName(''); setNewSequenceModalOpen(true); }}>
                        <Plus size={14} className="mr-1" aria-hidden="true" />New sequence
                    </Button>
                </div>
                {loadingSequences ? (
                    <p className="text-white/60 text-sm">Loading sequences…</p>
                ) : sequences.length === 0 ? (
                    <EmptyState icon={ListOrdered} title="No sequences yet" description="Create a sequence and add steps to send automated follow-ups." compact />
                ) : (
                    <ul className="space-y-6">
                        {sequences.map((seq) => (
                            <li key={seq.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <span className="font-medium text-white">{seq.name}</span>
                                    <span className="text-sm text-white/50">{seq.active_enrolments ?? 0} active</span>
                                    <div className="flex gap-2">
                                        <Button variant="secondary" size="sm" onClick={() => { setEnrolSequenceId(seq.id); setEnrolListId(''); setEnrolModalOpen(true); }} aria-label={`Enrol leads into ${seq.name}`}>
                                            <Users size={13} className="mr-1" aria-hidden="true" />Enrol leads
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => { setAddStepSequenceId(seq.id); setAddStepTemplateId(templates[0]?.id ? String(templates[0].id) : ''); setAddStepDelayDays((seq.steps?.length ?? 0) > 0 ? 3 : 0); setAddStepCondition('not_opened'); setAddStepModalOpen(true); }} aria-label={`Add step to ${seq.name}`}>
                                            <Plus size={13} aria-hidden="true" />Add step
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {(seq.steps ?? []).length === 0 ? (
                                        <p className="text-sm text-white/50">No steps. Add a step to send immediately or after a delay.</p>
                                    ) : (
                                        (seq.steps ?? []).map((step, idx) => (
                                            <div key={step.id} className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="text-white/70">Step {step.step_number}:</span>
                                                <span className="text-white/90">{step.template_name ?? `Template #${step.template_id}`}</span>
                                                {step.step_number === 1 ? (
                                                    <span className="text-white/50">— Send immediately</span>
                                                ) : (
                                                    <span className="text-white/50">— Wait {step.delay_days} day(s) if {SEQUENCE_CONDITIONS.find((c) => c.value === step.condition)?.label ?? step.condition}</span>
                                                )}
                                                {idx < (seq.steps ?? []).length - 1 && (
                                                    <span className="text-white/40 block w-full pl-4 border-l-2 border-white/10 mt-1 mb-1">↓</span>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </GlassCard>
            )}

            {activeTab === 'conversations' && (() => {
                const hasValidEmail = (l: { emails?: string[] }) => {
                    const email = l.emails?.[0];
                    return email && typeof email === 'string' && !['not found', 'unknown'].includes(email.trim().toLowerCase());
                };
                const leadsWithEmail = leads.filter(hasValidEmail);
                const preselectedId = conversationLeadId ? parseInt(conversationLeadId, 10) : null;
                const preselectedLead = preselectedId != null && !Number.isNaN(preselectedId) ? leads.find((l) => l.id === preselectedId) : null;
                const sidebarLeads =
                    preselectedLead && !leadsWithEmail.some((l) => l.id === preselectedLead.id)
                        ? [preselectedLead, ...leadsWithEmail]
                        : leadsWithEmail;

                const handleSelectLead = (leadId: number) => {
                    setConversationLeadId(String(leadId));
                };

                const selectedId = conversationLeadId ? parseInt(conversationLeadId, 10) : null;
                const selectedLead = selectedId != null && !Number.isNaN(selectedId) ? leads.find((l) => l.id === selectedId) : null;
                const selectedEmail = selectedLead?.emails?.[0];
                const selectedEmailValid =
                    selectedEmail && typeof selectedEmail === 'string' && !['not found', 'unknown'].includes(selectedEmail.trim().toLowerCase());

                return (
                    <GlassCard className="p-0 overflow-hidden">
                        <div className="flex h-[min(72vh,34rem)]">
                            <aside className="w-72 border-r border-white/10 bg-white/5 flex flex-col">
                                <div className="px-4 py-3 border-b border-white/10">
                                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <MessageCircle size={16} className="text-white/60" aria-hidden="true" />
                                        Inbox
                                    </h2>
                                    <p className="mt-1 text-xs text-white/50">
                                        Pick a lead to open the email thread.
                                    </p>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {sidebarLeads.length === 0 ? (
                                        <p className="px-4 py-6 text-sm text-white/50">
                                            No leads with contact emails yet.
                                        </p>
                                    ) : (
                                        <ul className="py-1">
                                            {sidebarLeads.map((lead) => {
                                                if (!lead) return null;
                                                const email = lead.emails?.[0];
                                                const label = lead.company_name || `Lead #${lead.id}`;
                                                const isActive = lead.id === selectedId;
                                                return (
                                                    <li key={lead.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectLead(lead.id)}
                                                            className={`w-full text-left px-4 py-2.5 text-sm transition-[var(--transition-base)] flex flex-col gap-0.5 ${
                                                                isActive ? 'bg-violet-500/25 text-white' : 'text-white/80 hover:bg-white/5'
                                                            }`}
                                                        >
                                                            <span className="font-medium truncate">{label}</span>
                                                            {email && (
                                                                <span className="text-xs text-white/60 truncate">{email}</span>
                                                            )}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </aside>
                            <section className="flex-1 flex flex-col bg-slate-950/60">
                                {!selectedLead ? (
                                    <div className="flex-1 flex items-center justify-center px-6">
                                        <div className="text-center max-w-sm">
                                            <p className="text-sm text-white/60">
                                                Select a lead from the left to start viewing and replying to emails.
                                            </p>
                                        </div>
                                    </div>
                                ) : !selectedEmailValid ? (
                                    <div className="flex-1 flex items-center justify-center px-6">
                                        <div className="text-center max-w-sm">
                                            <p className="text-sm text-white/60">
                                                This lead does not have a valid contact email. Add one on the company page, then come back here to continue the
                                                conversation.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col">
                                        <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">
                                                    {selectedLead.company_name || `Lead #${selectedLead.id}`}
                                                </h3>
                                                <p className="text-xs text-white/60 truncate">{(selectedEmail as string).trim()}</p>
                                            </div>
                                        </header>
                                        <div className="flex-1 min-h-0 flex flex-col">
                                            <LeadEmailConversation
                                                key={selectedLead.id}
                                                leadId={selectedLead.id}
                                                leadEmail={(selectedEmail as string).trim()}
                                                onSent={() => {
                                                    void queryClient.invalidateQueries({ queryKey: ['email-logs'] });
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    </GlassCard>
                );
            })()}

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit template' : 'New template'} size="lg">
                {saveError && <div className="mb-4 p-3 rounded-inner bg-red-500/20 border border-red-400/30 text-red-200 text-sm" role="alert">{saveError}</div>}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="outreach-name" className="block text-sm text-white/70 mb-1">Name</label>
                        <Input id="outreach-name" value={formName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)} placeholder="e.g. Cold outreach v1" />
                    </div>
                    <div>
                        <label htmlFor="outreach-subject" className="block text-sm text-white/70 mb-1">Subject</label>
                        <Input id="outreach-subject" value={formSubject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormSubject(e.target.value)} placeholder="Email subject line" />
                    </div>
                    <div>
                        <label htmlFor="outreach-body" className="block text-sm text-white/70 mb-1">Body</label>
                        <textarea id="outreach-body" className="w-full bg-white/5 border border-white/10 rounded-inner px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/50 min-h-[120px]" rows={6} value={formBody} onChange={(e) => setFormBody(e.target.value)} placeholder="Email body (plain text or HTML)" />
                        <p className="mt-1 text-xs text-white/50">Variables: {`{{company_name}} {{director_name}} {{director_first_name}} {{incorporation_date}} {{company_type}} {{referral_link}} {{sender_name}}`}</p>
                    </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                    <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save'}</Button>
                </div>
            </Modal>

            <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview template" size="lg">
                {previewTemplate && (
                    <>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="preview-lead" className="block text-sm font-medium text-white/80 mb-1">
                                    Preview with lead
                                </label>
                                <Select
                                    id="preview-lead"
                                    value={previewLeadId}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPreviewLeadId(e.target.value)}
                                    aria-label="Select a lead to preview variables"
                                >
                                    <option value="">Select a lead…</option>
                                    {leads.map((l) => (
                                        <option key={l.id} value={String(l.id)}>
                                            {l.company_name || `Lead #${l.id}`}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            {previewLoading && <p className="text-sm text-white/60">Loading preview…</p>}
                            {previewData && !previewLoading && (
                                <>
                                    {previewData.unresolvedVars.length > 0 && (
                                        <div className="p-3 rounded-inner bg-amber-500/20 border border-amber-400/30 text-amber-200 text-sm" role="alert">
                                            Unresolved variables: {previewData.unresolvedVars.join(', ')}
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-xs font-semibold text-white/50 uppercase">Subject</span>
                                        <p className="mt-1 p-3 rounded-inner bg-white/5 border border-white/10 text-white/90 text-sm">
                                            {previewData.subject || '(empty)'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-white/50 uppercase">Body</span>
                                        <pre className="mt-1 p-3 rounded-inner bg-white/5 border border-white/10 text-white/80 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto font-sans">
                                            {previewData.body || '(empty)'}
                                        </pre>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="mt-6 pt-4 border-t border-white/10 space-y-4">
                            <div>
                                <p className="text-sm font-medium text-white/80 mb-1">Send to company contact</p>
                                {previewLeadId && !leadContactEmail && (
                                    <p className="text-sm text-white/50 mb-2">This lead has no contact email. Add or edit the email on the company detail page first.</p>
                                )}
                                {previewLeadId && leadContactEmail && (
                                    <p className="text-sm text-white/70 mb-2">
                                        Send this email to <strong className="text-white/90">{leadContactEmail}</strong>
                                    </p>
                                )}
                                <Button
                                    variant="primary"
                                    onClick={handleSendToLead}
                                    disabled={!previewLeadId || !leadContactEmail || sendToLeadMutation.isPending}
                                    aria-label="Send email to lead contact"
                                >
                                    <Send size={14} className="mr-1" aria-hidden="true" />
                                    {sendToLeadMutation.isPending ? 'Sending…' : 'Send to lead'}
                                </Button>
                                {sendToLeadMutation.isError && (
                                    <p className="text-sm text-red-300 mt-2" role="alert">
                                        {sendToLeadMutation.error instanceof Error ? sendToLeadMutation.error.message : 'Send failed'}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="test-email" className="block text-sm font-medium text-white/80">
                                    Send test email to myself
                                </label>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <Input
                                        id="test-email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={testEmail}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestEmail(e.target.value)}
                                        className="flex-1 min-w-[200px]"
                                        aria-label="Email address to receive test"
                                    />
                                    <Button
                                        variant="secondary"
                                        onClick={handleSendTest}
                                        disabled={!previewLeadId || !testEmail.trim() || sendTestMutation.isPending}
                                        aria-label="Send test email"
                                    >
                                        <Send size={14} className="mr-1" aria-hidden="true" />
                                        {sendTestMutation.isPending ? 'Sending…' : 'Send test'}
                                    </Button>
                                </div>
                                {sendTestMutation.isError && (
                                    <p className="text-sm text-red-300 mt-2" role="alert">
                                        {sendTestMutation.error instanceof Error ? sendTestMutation.error.message : 'Send failed'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </Modal>

            <Modal open={newSequenceModalOpen} onClose={() => setNewSequenceModalOpen(false)} title="New sequence" size="md">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="sequence-name" className="block text-sm font-medium text-white/80 mb-1">Name</label>
                        <Input id="sequence-name" value={newSequenceName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSequenceName(e.target.value)} placeholder="e.g. Cold outreach follow-up" />
                    </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                    <Button variant="secondary" onClick={() => setNewSequenceModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={() => { if (newSequenceName.trim()) createSequenceMutation.mutate(newSequenceName.trim()); }} disabled={!newSequenceName.trim() || createSequenceMutation.isPending}>{createSequenceMutation.isPending ? 'Creating…' : 'Create'}</Button>
                </div>
            </Modal>

            <Modal open={addStepModalOpen} onClose={() => setAddStepModalOpen(false)} title="Add step" size="md">
                {addStepSequenceId != null && (
                    <>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="step-template" className="block text-sm font-medium text-white/80 mb-1">Template</label>
                                <Select id="step-template" value={addStepTemplateId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddStepTemplateId(e.target.value)} aria-label="Email template">
                                    <option value="">Select template…</option>
                                    {templates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                                </Select>
                            </div>
                            <div>
                                <label htmlFor="step-delay" className="block text-sm font-medium text-white/80 mb-1">Wait (days after previous step)</label>
                                <Input id="step-delay" type="number" min={0} max={365} value={addStepDelayDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddStepDelayDays(parseInt(e.target.value, 10) || 0)} />
                            </div>
                            <div>
                                <label htmlFor="step-condition" className="block text-sm font-medium text-white/80 mb-1">Send only if</label>
                                <Select id="step-condition" value={addStepCondition} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddStepCondition(e.target.value)} aria-label="Step condition">
                                    {SEQUENCE_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </Select>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-6">
                            <Button variant="secondary" onClick={() => setAddStepModalOpen(false)}>Cancel</Button>
                            <Button variant="primary" onClick={() => {
                                const seq = sequences.find((s) => s.id === addStepSequenceId);
                                const stepNumber = seq && seq.steps && seq.steps.length > 0 ? seq.steps.length + 1 : 1;
                                const templateId = parseInt(addStepTemplateId, 10);
                                if (!Number.isNaN(templateId)) addStepMutation.mutate({ seqId: addStepSequenceId!, payload: { step_number: stepNumber, template_id: templateId, delay_days: addStepDelayDays, condition: addStepCondition } });
                            }} disabled={!addStepTemplateId || addStepMutation.isPending}>{addStepMutation.isPending ? 'Adding…' : 'Add step'}</Button>
                        </div>
                    </>
                )}
            </Modal>

            <Modal open={enrolModalOpen} onClose={() => setEnrolModalOpen(false)} title="Enrol leads" size="md">
                {enrolSequenceId != null && (
                    <>
                        <div className="space-y-4">
                            <p className="text-sm text-white/70">Choose a list. All leads in that list will be enrolled into the sequence (first email sent immediately).</p>
                            <div>
                                <label htmlFor="enrol-list" className="block text-sm font-medium text-white/80 mb-1">List</label>
                                <Select id="enrol-list" value={enrolListId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEnrolListId(e.target.value)} aria-label="Select list">
                                    <option value="">Select list…</option>
                                    {lists.map((l) => <option key={l.id} value={String(l.id)}>{l.name} ({(l as { lead_count?: number }).lead_count ?? 0} leads)</option>)}
                                </Select>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-6">
                            <Button variant="secondary" onClick={() => setEnrolModalOpen(false)}>Cancel</Button>
                            <Button variant="primary" onClick={() => { const listId = parseInt(enrolListId, 10); if (Number.isInteger(listId) && listId >= 1) enrolMutation.mutate({ seqId: enrolSequenceId, listId }); }} disabled={!enrolListId || enrolMutation.isPending}>{enrolMutation.isPending ? 'Enrolling…' : 'Enrol'}</Button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}
