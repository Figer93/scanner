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

function FilterSection({
    title,
    icon,
    open: initialOpen = false,
    badge,
    children,
}: {
    title: string;
    icon?: string;
    open?: boolean;
    badge?: number;
    children: React.ReactNode;
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
            <div className={open ? 'pb-3 px-2 space-y-3' : 'hidden'}>{children}</div>
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
        <aside className="space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight text-white">Find leads</h2>
                    <p className="text-[11px] text-white/50">
                        Stack your best-fit companies with a few focused filters.
                    </p>
                </div>
                {typeof filteredCount === 'number' && (
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                        {filteredCount} match{filteredCount === 1 ? '' : 'es'}
                    </span>
                )}
            </div>

            <FilterSection title="Primary filters" icon="●" open>
                <div className="space-y-2">
                    <Input
                        placeholder="Search by name or number..."
                        value={store.searchQuery}
                        onChange={inputHandler(store.setSearchQuery)}
                        aria-label="Search companies"
                        className="py-2.5 text-sm min-h-[2.5rem] focus:ring-2 focus:ring-[var(--color-accent-primary)] focus:border-[var(--color-border-active)]"
                    />

                    <div className="space-y-1">
                        <span className="block text-[11px] font-medium text-white/60">Company status</span>
                        <div className="flex flex-wrap gap-1.5">
                            <ChipButton active={!store.statusFilter} onClick={() => store.setStatusFilter(null)}>
                                All
                            </ChipButton>
                            {STATUS_OPTIONS.map((s) => (
                                <ChipButton
                                    key={s}
                                    active={store.statusFilter === s}
                                    onClick={() => store.setStatusFilter(store.statusFilter === s ? null : s)}
                                >
                                    {s}
                                </ChipButton>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="block text-[11px] font-medium text-white/60">Minimum score</span>
                            <button
                                type="button"
                                className="px-2 py-0.5 text-[11px] font-medium rounded-lg border bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                                onClick={() => store.setMinScore(null)}
                            >
                                Clear
                            </button>
                        </div>
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
                                className="flex-1 min-w-0 h-1.5 rounded-lg appearance-none bg-white/10 accent-[var(--color-accent-primary)]"
                                aria-label="Minimum lead score"
                            />
                            <span className="text-xs font-medium text-white/80 min-w-[3rem] text-right">
                                {store.minScore != null ? `≥ ${store.minScore}` : 'All'}
                            </span>
                        </div>
                        <p className="text-[11px] text-white/50" aria-live="polite">
                            {store.minScore != null ? (
                                <>
                                    Score ≥ {store.minScore}
                                    {filteredCount != null ? ` · ${filteredCount} lead${filteredCount !== 1 ? 's' : ''}` : ''}
                                </>
                            ) : (
                                <>
                                    Showing all
                                    {filteredCount != null ? ` · ${filteredCount} lead${filteredCount !== 1 ? 's' : ''}` : ''}
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </FilterSection>

            <FilterSection title="More filters" icon="▣" badge={companyAttributesFilterCount + companyDetailsFilterCount}>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <span className="block text-[11px] font-medium text-white/60">Company type</span>
                        <div className="flex flex-wrap gap-1.5">
                            <ChipButton active={!store.typeFilter} onClick={() => store.setTypeFilter(null)}>
                                All
                            </ChipButton>
                            {TYPE_OPTIONS.map((t) => (
                                <ChipButton
                                    key={t}
                                    active={store.typeFilter === t}
                                    onClick={() => store.setTypeFilter(store.typeFilter === t ? null : t)}
                                >
                                    {t}
                                </ChipButton>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <span className="block text-[11px] font-medium text-white/60">Location / postcode</span>
                            <Input
                                placeholder="Postcode or location..."
                                value={store.locationQuery}
                                onChange={inputHandler(store.setLocationQuery)}
                                aria-label="Filter by location or postcode"
                            />
                        </div>
                        <div className="space-y-1">
                            <span className="block text-[11px] font-medium text-white/60">Incorporation date</span>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="From (YYYY)"
                                    value={store.incorporatedFrom}
                                    onChange={inputHandler(store.setIncorporatedFrom)}
                                />
                                <Input
                                    placeholder="To"
                                    value={store.incorporatedTo}
                                    onChange={inputHandler(store.setIncorporatedTo)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="block text-[11px] font-medium text-white/60">Company attributes</span>
                        <p className="text-[11px] text-white/50">
                            Match SIC codes and description. Use commas or semicolons for multiple terms.
                        </p>
                        <Input
                            placeholder="Industries to include"
                            value={store.industriesInclude}
                            onChange={inputHandler(store.setIndustriesInclude)}
                        />
                        <Input
                            placeholder="Industries to exclude"
                            value={store.industriesExclude}
                            onChange={inputHandler(store.setIndustriesExclude)}
                        />
                        <Input
                            placeholder="Company types (free text)"
                            value={store.companyTypes}
                            onChange={inputHandler(store.setCompanyTypes)}
                        />
                        <Input
                            placeholder="Description keywords to include"
                            value={store.descriptionKeywordsInclude}
                            onChange={inputHandler(store.setDescriptionKeywordsInclude)}
                        />
                        <Input
                            placeholder="Description keywords to exclude"
                            value={store.descriptionKeywordsExclude}
                            onChange={inputHandler(store.setDescriptionKeywordsExclude)}
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="block text-[11px] font-medium text-white/60">Company details</span>
                        <p className="text-[11px] text-white/50">
                            Uses synced detail data (officers, PSCs, charges, ownership).
                        </p>
                        <Input
                            placeholder="Director / officer name"
                            value={store.officerName}
                            onChange={inputHandler(store.setOfficerName)}
                        />
                        <Input
                            placeholder="PSC name or nature of control"
                            value={store.pscText}
                            onChange={inputHandler(store.setPscText)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                type="number"
                                placeholder="Min charges"
                                min={0}
                                value={store.chargesMin}
                                onChange={inputHandler(store.setChargesMin)}
                            />
                            <Input
                                type="number"
                                placeholder="Max charges"
                                min={0}
                                value={store.chargesMax}
                                onChange={inputHandler(store.setChargesMax)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                type="number"
                                placeholder="Min directorships"
                                min={0}
                                value={store.directorshipsMin}
                                onChange={inputHandler(store.setDirectorshipsMin)}
                            />
                            <Input
                                type="number"
                                placeholder="Max directorships"
                                min={0}
                                value={store.directorshipsMax}
                                onChange={inputHandler(store.setDirectorshipsMax)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                type="number"
                                placeholder="Min share %"
                                min={0}
                                max={100}
                                value={store.shareMin}
                                onChange={inputHandler(store.setShareMin)}
                            />
                            <Input
                                type="number"
                                placeholder="Max share %"
                                min={0}
                                max={100}
                                value={store.shareMax}
                                onChange={inputHandler(store.setShareMax)}
                            />
                        </div>

                        <div className="space-y-1">
                            <span className="block text-[11px] font-medium text-white/60">Has domain URL</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['any', 'yes', 'no'] as const).map((opt) => (
                                    <ChipButton key={opt} active={store.hasDomain === opt} onClick={() => store.setHasDomain(opt)}>
                                        {opt === 'any' ? 'Any' : opt === 'yes' ? 'Yes' : 'No'}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="block text-[11px] font-medium text-white/60">Has LinkedIn link</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['any', 'yes', 'no'] as const).map((opt) => (
                                    <ChipButton
                                        key={opt}
                                        active={store.hasLinkedIn === opt}
                                        onClick={() => store.setHasLinkedIn(opt)}
                                    >
                                        {opt === 'any' ? 'Any' : opt === 'yes' ? 'Yes' : 'No'}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </FilterSection>
        </aside>
    );
}
