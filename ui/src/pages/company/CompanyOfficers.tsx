/**
 * Company detail cards: SIC codes, Officers, PSCs, Compliance, Links, Flags.
 * Renders as a bento grid of GlassCards.
 */

import { useMemo } from 'react';
import { GlassCard } from '../../components/ui';
import { capitalize, formatDate } from '../../lib/utils';

const HONORIFIC_PREFIX = /^(mr|mrs|ms|miss|dr|prof|sir|dame|lord|lady)\.?\s+/i;

/** Tokens for loose name matching (CH officer vs PSC wording). */
function nameTokenSet(raw: string | undefined): Set<string> {
    if (!raw) return new Set();
    let s = raw.toUpperCase().replace(HONORIFIC_PREFIX, '');
    s = s.replace(/,/g, ' ').replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return new Set(s.split(' ').filter((t) => t.length > 1));
}

function pscDuplicatesOfficer(
    pscName: string | undefined,
    officerList: Array<{ name?: string }>,
): boolean {
    const pTokens = nameTokenSet(pscName);
    if (pTokens.size < 2) return false;
    return officerList.some((o) => {
        const oTokens = nameTokenSet(o.name);
        if (oTokens.size < 2) return false;
        let overlap = 0;
        for (const t of pTokens) {
            if (oTokens.has(t)) overlap++;
        }
        return overlap >= 2;
    });
}

interface SectionCardProps {
    title: string;
    className?: string;
    children: React.ReactNode;
    compact?: boolean;
}

function SectionCard({ title, className = '', children, compact }: SectionCardProps) {
    return (
        <GlassCard className={className}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider text-[var(--color-text-primary)] ${compact ? 'mb-2' : 'mb-4'}`}>{title}</h2>
            {children}
        </GlassCard>
    );
}

interface DetailRowProps {
    label: string;
    value: string | React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
    return (
        <div className="flex justify-between items-baseline gap-2 min-w-0 leading-snug">
            <span className="text-xs text-[var(--color-text-secondary)] shrink-0">{label}</span>
            <span className="text-sm text-[var(--color-text-primary)] text-right truncate">{value}</span>
        </div>
    );
}

interface CompanyOfficersProps {
    sicCodes: Array<string | Record<string, string>>;
    officers: Array<{ name?: string }>;
    pscs: Array<{ name?: string; nature_of_control?: string }>;
    chargesOutstandingCount: number | string | undefined;
    accounts: Record<string, unknown>;
    confirmationStatement: Record<string, unknown>;
    totalActiveDirectorships: number | string | undefined;
    domainUrl: string | undefined;
    linkedinLink: string | undefined;
    sharePercentage: number | string | undefined;
    hasCharges: boolean | undefined;
    hasInsolvency: boolean | undefined;
    hasBeenLiquidated: boolean | undefined;
    undeliverableAddress: boolean | undefined;
    officeInDispute: boolean | undefined;
    canFile: boolean | undefined;
}

const linkCls = 'text-[var(--color-accent-secondary)] hover:opacity-90 underline text-sm break-all focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded';

export default function CompanyOfficers({
    sicCodes, officers, pscs, chargesOutstandingCount,
    accounts, confirmationStatement,
    totalActiveDirectorships, domainUrl, linkedinLink, sharePercentage,
    hasCharges, hasInsolvency, hasBeenLiquidated, undeliverableAddress, officeInDispute, canFile,
}: CompanyOfficersProps) {
    const showFlags = hasCharges != null || hasInsolvency != null || hasBeenLiquidated != null
        || undeliverableAddress || officeInDispute || canFile != null;
    const hasSic = Array.isArray(sicCodes) && sicCodes.length > 0;

    const pscsFiltered = useMemo(
        () => pscs.filter((p) => !pscDuplicatesOfficer(p.name, officers)),
        [pscs, officers],
    );

    return (
        <>
            {hasSic && (
                <SectionCard title="SIC codes" className="xl:col-span-1" compact>
                    <ul className="space-y-0.5">
                        {sicCodes.map((code, i) => (
                            <li key={i} className="text-sm font-mono text-[var(--color-text-primary)]">{typeof code === 'string' ? code : JSON.stringify(code)}</li>
                        ))}
                    </ul>
                </SectionCard>
            )}

            <SectionCard title="Officers (directors)" className={hasSic ? 'xl:col-span-1' : 'xl:col-span-2'} compact>
                {officers.length > 0 ? (
                    <ul className="space-y-0.5">
                        {officers.map((o, i) => <li key={i} className="text-sm text-[var(--color-text-primary)] truncate" title={o.name || '—'}>{o.name || '—'}</li>)}
                    </ul>
                ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">—</p>
                )}
            </SectionCard>

            <SectionCard title="PSCs" className="xl:col-span-1" compact>
                {pscsFiltered.length > 0 ? (
                    <ul className="space-y-0.5">
                        {pscsFiltered.map((p, i) => (
                            <li key={i} className="text-sm text-[var(--color-text-primary)]" title={`${p.name || '—'}${p.nature_of_control ? ` — ${p.nature_of_control}` : ''}`}>
                                <span className="font-medium truncate block">{p.name || '—'}</span>
                                {p.nature_of_control && <span className="text-xs text-[var(--color-text-muted)] block truncate">{String(p.nature_of_control).replace(/-/g, ' ')}</span>}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">—</p>
                )}
            </SectionCard>

            <SectionCard title="Compliance & filings" className="md:col-span-2 xl:col-span-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                    <DetailRow label="Outstanding charges" value={chargesOutstandingCount != null && chargesOutstandingCount !== '' ? String(Number(chargesOutstandingCount)) : '—'} />
                    {(accounts as Record<string, string>).next_due && <DetailRow label="Accounts next due" value={formatDate((accounts as Record<string, string>).next_due)} />}
                    {(accounts as Record<string, string>).next_made_up_to && <DetailRow label="Accounts made up to" value={formatDate((accounts as Record<string, string>).next_made_up_to)} />}
                    {(accounts as Record<string, Record<string, string>>).last_accounts && (
                        <DetailRow label="Last accounts" value={`${(accounts as Record<string, Record<string, string>>).last_accounts.type || '—'}${(accounts as Record<string, Record<string, string>>).last_accounts.made_up_to ? ` (${formatDate((accounts as Record<string, Record<string, string>>).last_accounts.made_up_to)})` : ''}`} />
                    )}
                    {(accounts as Record<string, boolean>).overdue != null && <DetailRow label="Accounts overdue" value={(accounts as Record<string, boolean>).overdue ? 'Yes' : 'No'} />}
                    {(confirmationStatement as Record<string, string>).next_due && <DetailRow label="Confirmation statement due" value={formatDate((confirmationStatement as Record<string, string>).next_due)} />}
                    {(confirmationStatement as Record<string, string>).last_made_up_to && <DetailRow label="Confirmation last made up to" value={formatDate((confirmationStatement as Record<string, string>).last_made_up_to)} />}
                    {(confirmationStatement as Record<string, boolean>).overdue != null && <DetailRow label="Confirmation overdue" value={(confirmationStatement as Record<string, boolean>).overdue ? 'Yes' : 'No'} />}
                </div>
            </SectionCard>

            <SectionCard title="Links & additional info" className="xl:col-span-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                    <DetailRow label="Active directorships" value={totalActiveDirectorships != null && totalActiveDirectorships !== '' ? String(totalActiveDirectorships) : '—'} />
                    <DetailRow label="Share %" value={sharePercentage != null && sharePercentage !== '' ? String(sharePercentage) : '—'} />
                    <div className="min-w-0">
                        <span className="text-xs text-[var(--color-text-secondary)] block mb-0.5">Domain</span>
                        {domainUrl ? <a href={domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`} target="_blank" rel="noopener noreferrer" className={`${linkCls} block truncate`}>{domainUrl.replace(/^https?:\/\//, '')}</a> : <span className="text-sm text-[var(--color-text-muted)]">—</span>}
                    </div>
                    <div className="min-w-0">
                        <span className="text-xs text-[var(--color-text-secondary)] block mb-0.5">LinkedIn</span>
                        {linkedinLink ? <a href={linkedinLink.startsWith('http') ? linkedinLink : `https://${linkedinLink}`} target="_blank" rel="noopener noreferrer" className={`${linkCls} block truncate`}>Link</a> : <span className="text-sm text-[var(--color-text-muted)]">—</span>}
                    </div>
                </div>
            </SectionCard>

            {showFlags && (
                <SectionCard title="Flags" className="xl:col-span-1">
                    <div className="flex flex-wrap gap-1.5">
                        {hasCharges != null && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-white/10 text-[var(--color-text-primary)] border border-white/10">Charges: {hasCharges ? 'Y' : 'N'}</span>}
                        {hasInsolvency != null && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-white/10 text-[var(--color-text-primary)] border border-white/10">Insolvency: {hasInsolvency ? 'Y' : 'N'}</span>}
                        {hasBeenLiquidated != null && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-white/10 text-[var(--color-text-primary)] border border-white/10">Liquidated: {hasBeenLiquidated ? 'Y' : 'N'}</span>}
                        {undeliverableAddress && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30">Bad address</span>}
                        {officeInDispute && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30">Dispute</span>}
                        {canFile != null && <span className="px-2 py-0.5 rounded-[var(--radius-inner)] text-xs bg-white/10 text-[var(--color-text-primary)] border border-white/10">Can file: {canFile ? 'Y' : 'N'}</span>}
                    </div>
                </SectionCard>
            )}
        </>
    );
}
