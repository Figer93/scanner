/**
 * Email conversation thread for a lead: sent + received messages and reply compose.
 */

import { useCallback, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { GlassCard, Button } from '../../components/ui';
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

    const { data: messages = [], isLoading } = useQuery<EmailMessage[]>({
        queryKey: ['email-logs', leadId],
        queryFn: async () => {
            const d = await api.get(`/api/email-logs?leadId=${leadId}&limit=50`);
            return Array.isArray(d) ? d : [];
        },
        staleTime: 15_000,
    });

    const sendReplyMutation = useMutation({
        mutationFn: (payload: { subject: string; body: string }) =>
            api.post(`/api/leads/${leadId}/send-reply`, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['email-logs', leadId] });
            void queryClient.invalidateQueries({ queryKey: ['email-logs'] });
            setReplySubject('');
            setReplyBody('');
            onSent?.();
        },
    });

    const handleSendReply = useCallback(() => {
        const subject = replySubject.trim();
        const body = replyBody.trim();
        if (!subject || !body) return;
        sendReplyMutation.mutate({ subject, body });
    }, [replySubject, replyBody, sendReplyMutation]);

    const thread = [...messages].reverse();

    return (
        <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Mail size={15} className="text-white/40" aria-hidden="true" />
                Email conversation
            </h2>

            {isLoading ? (
                <p className="text-sm text-white/50">Loading…</p>
            ) : thread.length === 0 ? (
                <p className="text-sm text-white/50 mb-4">
                    No emails yet. Send a reply below to start the thread. To see replies from the contact here, set up the Brevo Inbound webhook in Profile → Email tracking.
                </p>
            ) : (
                <div className="space-y-3 mb-4 max-h-[320px] overflow-y-auto">
                    {thread.map((msg) => {
                        const isOutbound = (msg.direction || '').toLowerCase() === 'outbound';
                        return (
                            <div
                                key={msg.id}
                                className={`rounded-inner p-3 text-sm border ${
                                    isOutbound
                                        ? 'bg-violet-500/10 border-violet-400/20 ml-4'
                                        : 'bg-white/5 border-white/10 mr-4'
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-white/70">
                                        {isOutbound ? 'You' : (msg.from_email || 'Them')}
                                    </span>
                                    <span className="text-xs text-white/50">{formatDateTime(msg.sent_at)}</span>
                                    {msg.status && msg.status !== 'sent' && (
                                        <span className="text-xs text-white/40">· {msg.status}</span>
                                    )}
                                </div>
                                {msg.subject && (
                                    <p className="text-xs font-medium text-white/80 mb-1">Re: {msg.subject}</p>
                                )}
                                <pre className="text-xs text-white/80 whitespace-pre-wrap break-words font-sans mt-1">
                                    {msg.body || '(no body)'}
                                </pre>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="pt-3 border-t border-white/10 space-y-2">
                <label htmlFor="reply-subject" className="block text-xs font-medium text-white/70">
                    Subject
                </label>
                <input
                    id="reply-subject"
                    type="text"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    placeholder="Re: …"
                    className="w-full px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)] text-sm"
                    disabled={sendReplyMutation.isPending}
                />
                <label htmlFor="reply-body" className="block text-xs font-medium text-white/70">
                    Message
                </label>
                <textarea
                    id="reply-body"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your reply…"
                    rows={4}
                    className="w-full px-3 py-2 rounded-inner bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-[var(--color-border-active)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-active)] text-sm resize-y min-h-[80px]"
                    disabled={sendReplyMutation.isPending}
                />
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSendReply}
                    disabled={!replySubject.trim() || !replyBody.trim() || sendReplyMutation.isPending}
                    aria-label="Send reply"
                >
                    <Send size={14} className="mr-1" aria-hidden="true" />
                    {sendReplyMutation.isPending ? 'Sending…' : 'Send reply'}
                </Button>
                {sendReplyMutation.isError && (
                    <p className="text-xs text-red-300" role="alert">
                        {sendReplyMutation.error instanceof Error ? sendReplyMutation.error.message : 'Send failed'}
                    </p>
                )}
                <p className="text-xs text-white/40">To: {leadEmail}</p>
            </div>
        </GlassCard>
    );
}
