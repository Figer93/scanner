/**
 * Email conversation thread for a lead: sent + received messages and reply compose.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, Send } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { Button } from '../../components/ui';
import { formatDateTime } from '../../lib/utils';

interface EmailMessage {
    id: number;
    lead_id: number;
    direction: string;
    status: string;
    sent_at: string;
    subject: string | null;
    body: string | null;
    from_email: string | null;
    to_email: string | null;
    company_name?: string;
    matched_via?: string | null;
    provider_message_id?: string | null;
    brevo_message_id?: string | null;
}

interface LeadEmailConversationProps {
    leadId: number;
    leadEmail: string;
    onSent?: () => void;
}

export default function LeadEmailConversation({ leadId, leadEmail, onSent }: LeadEmailConversationProps) {
    const queryClient = useQueryClient();
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [replyInReplyToMessageId, setReplyInReplyToMessageId] = useState<string | null>(null);
    const [threadMessages, setThreadMessages] = useState<EmailMessage[]>([]);
    const threadViewportRef = useRef<HTMLDivElement | null>(null);
    const lastLeadIdRef = useRef<number | null>(null);

    const { data: messages, isLoading, isError, error } = useQuery<EmailMessage[]>({
        queryKey: ['email-logs', leadId],
        queryFn: async () => {
            const d = await api.get(`/api/email-logs?leadId=${leadId}&limit=50`);
            return Array.isArray(d) ? d : [];
        },
        staleTime: 15_000,
        refetchInterval: 5_000,
        refetchIntervalInBackground: true,
    });

    // Keep the last successfully loaded thread visible.
    // If refetch fails, we do NOT want to flash an empty state / loader.
    useEffect(() => {
        if (Array.isArray(messages)) setThreadMessages(messages);
    }, [messages]);

    useEffect(() => {
        // Switching leads should reset the thread immediately.
        setThreadMessages([]);
    }, [leadId]);

    const sendReplyMutation = useMutation({
        mutationFn: (payload: { subject: string; body: string; inReplyToMessageId?: string }) =>
            api.post(`/api/leads/${leadId}/send-reply`, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['email-logs', leadId] });
            void queryClient.invalidateQueries({ queryKey: ['email-logs'] });
            setReplySubject('');
            setReplyBody('');
            setReplyInReplyToMessageId(null);
            onSent?.();
        },
    });

    const handleSendReply = useCallback(() => {
        const subject = replySubject.trim();
        const body = replyBody.trim();
        if (!subject || !body) return;
        sendReplyMutation.mutate({ subject, body, inReplyToMessageId: replyInReplyToMessageId || undefined });
    }, [replySubject, replyBody, replyInReplyToMessageId, sendReplyMutation]);

    const handleReplyToMessage = useCallback((msg: EmailMessage) => {
        const messageId = msg.provider_message_id || msg.brevo_message_id || null;
        setReplyInReplyToMessageId(messageId);

        const subj = (msg.subject || '').trim();
        if (!subj) {
            setReplySubject('No subject (CHScanner)');
            return;
        }
        setReplySubject(subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`);
    }, []);

    const thread = useMemo(() => {
        const copy = Array.isArray(threadMessages) ? [...threadMessages] : [];
        // Rely on insertion order in email_logs: lower id = older message.
        copy.sort((a, b) => (a.id || 0) - (b.id || 0));
        return copy;
    }, [threadMessages]);

    useEffect(() => {
        // Chat UX: only auto-scroll if the user is already near the bottom.
        const el = threadViewportRef.current;
        if (!el) return;

        const leadChanged = lastLeadIdRef.current !== leadId;
        lastLeadIdRef.current = leadId;

        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const shouldStickToBottom = leadChanged || distanceFromBottom < 160;

        if (!shouldStickToBottom) return;
        el.scrollTo({ top: el.scrollHeight, behavior: leadChanged ? 'auto' : 'smooth' });
    }, [leadId, thread.length]);

    useEffect(() => {
        // Best-effort subject default to behave like a "reply" thread, but keep it editable.
        if (replySubject.trim()) return;
        const lastWithSubject = [...thread].reverse().find((m) => (m.subject || '').trim());
        const base = (lastWithSubject?.subject || '').trim();
        if (!base) {
            setReplySubject('No subject (CHScanner)');
            return;
        }
        setReplySubject(base.toLowerCase().startsWith('re:') ? base : `Re: ${base}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leadId, thread]);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div ref={threadViewportRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
                {isLoading && threadMessages.length === 0 ? (
                    <p className="text-sm text-white/50">Loading…</p>
                ) : thread.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center max-w-md">
                            <p className="text-sm text-white/60">
                                No emails yet. Send a message below to start the thread.
                            </p>
                            <p className="mt-2 text-xs text-white/40">
                                To see inbound replies here, set up the Brevo Inbound webhook in Profile → Email tracking.
                            </p>
                            {isError && (
                                <p className="mt-3 text-xs text-red-300" role="alert">
                                    {error instanceof Error ? error.message : 'Failed to load email logs'}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {thread.map((msg) => {
                            const isOutbound = (msg.direction || '').toLowerCase() === 'outbound';
                            const displayName = isOutbound ? 'You' : (msg.from_email || 'Them');
                            const body = (msg.body || '').trim() || '(no body)';
                            return (
                                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[78%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div
                                            className={`px-4 py-2.5 text-sm border shadow-sm ${
                                                isOutbound
                                                    ? 'bg-violet-500/25 border-violet-400/25 text-white rounded-2xl rounded-br-md'
                                                    : 'bg-white/8 border-white/10 text-white/90 rounded-2xl rounded-bl-md'
                                            }`}
                                        >
                                            {msg.direction === 'inbound' && msg.matched_via === 'sender_fallback' && (
                                                <div className="text-[11px] text-white/70 font-medium mb-1 truncate">
                                                    Direct message
                                                </div>
                                            )}
                                            {msg.subject && (
                                                <div className="text-[11px] text-white/70 font-medium mb-1 truncate">
                                                    {msg.subject}
                                                </div>
                                            )}
                                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                                                {body}
                                            </pre>
                                        </div>
                                        <div className={`mt-1 px-1 text-[11px] ${isOutbound ? 'text-white/45' : 'text-white/40'}`}>
                                            <span>{displayName}</span>
                                            <span className="mx-1">·</span>
                                            <span>{formatDateTime(msg.sent_at)}</span>
                                            {msg.status && msg.status !== 'sent' && (
                                                <>
                                                    <span className="mx-1">·</span>
                                                    <span className="text-white/35">{msg.status}</span>
                                                </>
                                            )}
                                            {!isOutbound && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleReplyToMessage(msg)}
                                                    className="ml-2 inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/80 underline"
                                                    aria-label="Reply to this message"
                                                >
                                                    <CornerUpLeft size={12} aria-hidden="true" />
                                                    Reply
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="h-1" aria-hidden="true" />
                    </>
                )}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-slate-950/60 px-5 py-4 pb-5">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-xs text-white/45 truncate">
                        To: <span className="text-white/70">{leadEmail}</span>
                    </div>
                </div>

                <div className="grid gap-2">
                    <input
                        id="reply-subject"
                        type="text"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        placeholder="Subject (required for email)…"
                        className="w-full px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)] text-sm"
                        disabled={sendReplyMutation.isPending}
                    />
                    <div className="flex items-end gap-2">
                        <textarea
                            id="reply-body"
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleSendReply();
                                }
                            }}
                            placeholder="Message… (Ctrl+Enter to send)"
                            rows={2}
                            className="flex-1 px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)] text-sm resize-none min-h-[44px] max-h-[140px] overflow-y-auto"
                            disabled={sendReplyMutation.isPending}
                        />
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSendReply}
                            disabled={!replySubject.trim() || !replyBody.trim() || sendReplyMutation.isPending}
                            aria-label="Send message"
                            className="shrink-0"
                        >
                            <Send size={14} className="mr-1" aria-hidden="true" />
                            {sendReplyMutation.isPending ? 'Sending…' : 'Send'}
                        </Button>
                    </div>
                    {sendReplyMutation.isError && (
                        <p className="text-xs text-red-300" role="alert">
                            {sendReplyMutation.error instanceof Error ? sendReplyMutation.error.message : 'Send failed'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
