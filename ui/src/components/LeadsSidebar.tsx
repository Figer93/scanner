/**
 * LeadsSidebar — filter sidebar for the Find Leads page.
 *
 * Reads/writes from useFilterStore. Optional filteredCount shows matching leads for score filter.
 */

import { useState } from 'react';
import { Input } from './ui';
import { useFilterStore } from '../stores/filterStore';

const STATUS_OPTIONS = ['Active', 'Dissolved', 'Liquidation', 'Receivership', 'Administration', 'Voluntary Arrangement'];
const TYPE_OPTIONS = ['ltd', 'plc', 'llp', 'limited-partnership', 'limited-liability-partnership', 'partnership', 'other'];

function FilterSection({ title, icon, open: initialOpen = false, badge, children }: {
    title: string; icon?: string; open?: boolean; badge?: number; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(initialOpen);
    return (
        <div className="border-b border-white/10 last:border-b-0">
            <button
                type="button"
                className="flex items-center justify-between w-full py-3 px-2 text-left text-sm font-medium text-white/90 hover:bg-white/5 rounded-lg transition-colors"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
            >
                <span className="flex items-center gap-2">
                    {icon && <span className="opacity-70" aria-hidden="true">{icon}</span>}
                    {title}
                    {badge != null && badge > 0 && (
                        <span className="text-xs text-white/50">{badge} filter{badge !== 1 ? 's' : ''}</span>
                    )}
                </span>
                <span className={`text-xs text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
            </button>
            <div className={open ? 'pb-3 px-2' : 'hidden'}>{children}</div>
        </div>
    );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            className={`px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors border ${
                active
                    ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400/40'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** Type-safe input change handler */
function inputHandler(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value);
}

interface LeadsSidebarProps {
    /** When provided, shown next to minimum score filter as matching count. */
    filteredCount?: number | null;
}

export default function LeadsSidebar({ filteredCount = null }: LeadsSidebarProps) {
    const store = useFilterStore();

    const companyAttributesFilterCount = [
        store.industriesInclude.trim(), store.industriesExclude.trim(),
        store.companyTypes.trim(), store.descriptionKeywordsInclude.trim(),
        store.descriptionKeywordsExclude.trim(),
    ].filter(Boolean).length;

    const companyDetailsFilterCount = [
        store.officerName.trim(), store.pscText.trim(),
        store.chargesMin.trim(), store.chargesMax.trim(),
        store.directorshipsMin.trim(), store.directorshipsMax.trim(),
        store.shareMin.trim(), store.shareMax.trim(),
        store.hasDomain !== 'any' ? 'y' : '', store.hasLinkedIn !== 'any' ? 'y' : '',
        store.minScore != null ? 'y' : '',
    ].filter(Boolean).length;

    return (
        <aside className="space-y-2">
            <div className="pb-4 border-b border-white/10">
                <Input
                    placeholder="Search by name or number..."
                    value={store.searchQuery}
                    onChange={inputHandler(store.setSearchQuery)}
                    aria-label="Search companies"
                    className="py-3 text-base min-h-[2.75rem] focus:ring-2 focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-border-active)]"
                />
            </div>

            <FilterSection title="Company Status" icon="●" open>
                <div className="flex flex-wrap gap-1.5">
                    <ChipButton active={!store.statusFilter} onClick={() => store.setStatusFilter(null)}>All</ChipButton>
                    {STATUS_OPTIONS.map((s) => (
                        <ChipButton key={s} active={store.statusFilter === s} onClick={() => store.setStatusFilter(store.statusFilter === s ? null : s)}>{s}</ChipButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection title="Company Type" icon="◇">
                <div className="flex flex-wrap gap-1.5">
                    <ChipButton active={!store.typeFilter} onClick={() => store.setTypeFilter(null)}>All</ChipButton>
                    {TYPE_OPTIONS.map((t) => (
                        <ChipButton key={t} active={store.typeFilter === t} onClick={() => store.setTypeFilter(store.typeFilter === t ? null : t)}>{t}</ChipButton>
                    ))}
                </div>
            </FilterSection>

            <FilterSection title="Location / Postcode" icon="⌖">
                <Input placeholder="Postcode or location..." value={store.locationQuery} onChange={inputHandler(store.setLocationQuery)} aria-label="Filter by location or postcode" className="mb-2" />
            </FilterSection>

            <FilterSection title="Incorporation date" icon="📅">
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">From (YYYY or YYYY-MM-DD)</label>
                <Input placeholder="e.g. 2020 or 2020-01-01" value={store.incorporatedFrom} onChange={inputHandler(store.setIncorporatedFrom)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">To (YYYY or YYYY-MM-DD)</label>
                <Input placeholder="e.g. 2024 or 2024-12-31" value={store.incorporatedTo} onChange={inputHandler(store.setIncorporatedTo)} />
            </FilterSection>

            <FilterSection title="Company attributes" icon="◈" badge={companyAttributesFilterCount}>
                <p className="text-xs text-white/50 mb-2">Match SIC codes and company name. Comma or semicolon = multiple terms.</p>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Industries to include</label>
                <Input placeholder="e.g. Software development" value={store.industriesInclude} onChange={inputHandler(store.setIndustriesInclude)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Industries to exclude</label>
                <Input placeholder="e.g. Advertising services" value={store.industriesExclude} onChange={inputHandler(store.setIndustriesExclude)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Company types (free text)</label>
                <Input placeholder="e.g. Privately held" value={store.companyTypes} onChange={inputHandler(store.setCompanyTypes)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Description keywords to include</label>
                <Input placeholder="e.g. sales, data, outbound" value={store.descriptionKeywordsInclude} onChange={inputHandler(store.setDescriptionKeywordsInclude)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Description keywords to exclude</label>
                <Input placeholder="e.g. agency, marketing" value={store.descriptionKeywordsExclude} onChange={inputHandler(store.setDescriptionKeywordsExclude)} />
            </FilterSection>

            <FilterSection title="Minimum score" icon="★" open>
                <p className="text-xs text-white/50 mb-2">Only show companies with lead score ≥ value (1–10). Unscored companies are hidden.</p>
                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        type="range"
                        min={1}
                        max={10}
                        value={store.minScore ?? 1}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const v = parseInt(e.target.value, 10);
                            store.setMinScore(v >= 1 && v <= 10 ? v : null);
                        }}
                        className="flex-1 min-w-0 h-2 rounded-lg appearance-none bg-white/10 accent-[var(--color-accent-primary)]"
                        aria-label="Minimum lead score"
                    />
                    <button
                        type="button"
                        className="px-2.5 py-1 text-xs font-medium rounded-lg border bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
                        onClick={() => store.setMinScore(null)}
                    >
                        All
                    </button>
                </div>
                <p className="text-xs font-medium text-white/80 mt-2" aria-live="polite">
                    {store.minScore != null ? (
                        <>Score ≥ {store.minScore}{filteredCount != null ? ` (${filteredCount} lead${filteredCount !== 1 ? 's' : ''})` : ''}</>
                    ) : (
                        <>Show all{filteredCount != null ? ` (${filteredCount} lead${filteredCount !== 1 ? 's' : ''})` : ''}</>
                    )}
                </p>
            </FilterSection>

            <FilterSection title="Company details" icon="▣" badge={companyDetailsFilterCount} open>
                <p className="text-xs text-white/50 mb-2">Filters use data from company detail (sync each company to populate).</p>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Director / officer name</label>
                <Input placeholder="e.g. Smith" value={store.officerName} onChange={inputHandler(store.setOfficerName)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">PSC name or nature of control</label>
                <Input placeholder="e.g. ownership, shares" value={store.pscText} onChange={inputHandler(store.setPscText)} className="mb-2" />
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Charges outstanding</label>
                <div className="flex gap-2 mb-2">
                    <Input type="number" placeholder="Min" min={0} value={store.chargesMin} onChange={inputHandler(store.setChargesMin)} />
                    <Input type="number" placeholder="Max" min={0} value={store.chargesMax} onChange={inputHandler(store.setChargesMax)} />
                </div>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Total active directorships</label>
                <div className="flex gap-2 mb-2">
                    <Input type="number" placeholder="Min" min={0} value={store.directorshipsMin} onChange={inputHandler(store.setDirectorshipsMin)} />
                    <Input type="number" placeholder="Max" min={0} value={store.directorshipsMax} onChange={inputHandler(store.setDirectorshipsMax)} />
                </div>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Share %</label>
                <div className="flex gap-2 mb-2">
                    <Input type="number" placeholder="Min" min={0} max={100} value={store.shareMin} onChange={inputHandler(store.setShareMin)} />
                    <Input type="number" placeholder="Max" min={0} max={100} value={store.shareMax} onChange={inputHandler(store.setShareMax)} />
                </div>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Has domain URL</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {(['any', 'yes', 'no'] as const).map((opt) => (
                        <ChipButton key={opt} active={store.hasDomain === opt} onClick={() => store.setHasDomain(opt)}>
                            {opt === 'any' ? 'Any' : opt === 'yes' ? 'Yes' : 'No'}
                        </ChipButton>
                    ))}
                </div>
                <label className="block text-xs font-medium text-white/60 mt-2 mb-1">Has LinkedIn link</label>
                <div className="flex flex-wrap gap-1.5">
                    {(['any', 'yes', 'no'] as const).map((opt) => (
                        <ChipButton key={opt} active={store.hasLinkedIn === opt} onClick={() => store.setHasLinkedIn(opt)}>
                            {opt === 'any' ? 'Any' : opt === 'yes' ? 'Yes' : 'No'}
                        </ChipButton>
                    ))}
                </div>
            </FilterSection>
        </aside>
    );
}
