/**
 * Company overview card: header with name/status/type, meta grid, links.
 */

import { ExternalLink } from 'lucide-react';
import { GlassCard } from '../../components/ui';
import { capitalize, formatDate, formatAddress } from '../../lib/utils';

interface CompanyOverviewProps {
    name: string;
    status: string;
    statusBadgeCls: string;
    type: string;
    numDisplay: string;
    jurisdiction: string;
    incorpDate: string;
    address: string;
    domainUrl: string | undefined;
    linkedinLink: string | undefined;
}

const linkCls = 'text-[var(--color-accent-secondary)] hover:opacity-90 underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded';

export default function CompanyOverview({
    name, status, statusBadgeCls, type, numDisplay, jurisdiction,
    incorpDate, address, domainUrl, linkedinLink,
}: CompanyOverviewProps) {
    return (
        <GlassCard>
            <div className="flex flex-wrap items-center gap-2 mb-4 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] truncate">{name}</h1>
                <span className={`inline-flex px-2.5 py-0.5 rounded-[var(--radius-inner)] text-xs font-medium border shrink-0 ${statusBadgeCls}`}>
                    {capitalize(status) || '—'}
                </span>
                {type && <span className="text-sm text-[var(--color-text-secondary)] shrink-0">{capitalize(String(type).replace(/-/g, ' '))}</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm leading-relaxed">
                <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mt-0.5">Company no.</p>
                    <p className="font-mono text-[var(--color-text-primary)]">{numDisplay}</p>
                </div>
                <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mt-0.5">Jurisdiction</p>
                    <p className="text-[var(--color-text-primary)]">{jurisdiction ? capitalize(jurisdiction.replace(/-/g, ' ')) : '—'}</p>
                </div>
                <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mt-0.5">Incorporated</p>
                    <p className="text-[var(--color-text-primary)]">{formatDate(incorpDate)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mt-0.5">Registered office</p>
                    <p className="text-[var(--color-text-primary)] truncate" title={address}>{address}</p>
                </div>
            </div>

            {(domainUrl || linkedinLink) && (
                <div className="flex gap-4 mt-3 pt-3 border-t border-white/10">
                    {domainUrl && (
                        <a href={domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`} target="_blank" rel="noopener noreferrer" className={`text-sm ${linkCls} inline-flex items-center gap-1`}>
                            <ExternalLink size={14} aria-hidden="true" />Website
                        </a>
                    )}
                    {linkedinLink && (
                        <a href={linkedinLink.startsWith('http') ? linkedinLink : `https://${linkedinLink}`} target="_blank" rel="noopener noreferrer" className={`text-sm ${linkCls} inline-flex items-center gap-1`}>
                            <ExternalLink size={14} aria-hidden="true" />LinkedIn
                        </a>
                    )}
                </div>
            )}
        </GlassCard>
    );
}
