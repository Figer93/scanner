/**
 * Zustand store for CH company search filters.
 *
 * Replaces the 30+ individual props that LeadsSidebar currently receives
 * via prop drilling from Leads.jsx. Components read and write filters
 * directly from this store instead.
 */

import { create } from 'zustand';

export interface FilterState {
    searchQuery: string;
    statusFilter: string | null;
    typeFilter: string | null;
    locationQuery: string;
    incorporatedFrom: string;
    incorporatedTo: string;
    // Company attributes
    industriesInclude: string;
    industriesExclude: string;
    companyTypes: string;
    descriptionKeywordsInclude: string;
    descriptionKeywordsExclude: string;
    // Company details (from CH sync)
    officerName: string;
    pscText: string;
    chargesMin: string;
    chargesMax: string;
    directorshipsMin: string;
    directorshipsMax: string;
    shareMin: string;
    shareMax: string;
    hasDomain: 'any' | 'yes' | 'no';
    hasLinkedIn: 'any' | 'yes' | 'no';
    /** Minimum lead score 1–10; null = show all. */
    minScore: number | null;
}

interface FilterActions {
    setSearchQuery: (v: string) => void;
    setStatusFilter: (v: string | null) => void;
    setTypeFilter: (v: string | null) => void;
    setLocationQuery: (v: string) => void;
    setIncorporatedFrom: (v: string) => void;
    setIncorporatedTo: (v: string) => void;
    setIndustriesInclude: (v: string) => void;
    setIndustriesExclude: (v: string) => void;
    setCompanyTypes: (v: string) => void;
    setDescriptionKeywordsInclude: (v: string) => void;
    setDescriptionKeywordsExclude: (v: string) => void;
    setOfficerName: (v: string) => void;
    setPscText: (v: string) => void;
    setChargesMin: (v: string) => void;
    setChargesMax: (v: string) => void;
    setDirectorshipsMin: (v: string) => void;
    setDirectorshipsMax: (v: string) => void;
    setShareMin: (v: string) => void;
    setShareMax: (v: string) => void;
    setHasDomain: (v: 'any' | 'yes' | 'no') => void;
    setHasLinkedIn: (v: 'any' | 'yes' | 'no') => void;
    setMinScore: (v: number | null) => void;
    resetFilters: () => void;
    /** Number of non-default filters currently active */
    activeFilterCount: () => number;
}

const DEFAULT_STATE: FilterState = {
    searchQuery: '',
    statusFilter: null,
    typeFilter: null,
    locationQuery: '',
    incorporatedFrom: '',
    incorporatedTo: '',
    industriesInclude: '',
    industriesExclude: '',
    companyTypes: '',
    descriptionKeywordsInclude: '',
    descriptionKeywordsExclude: '',
    officerName: '',
    pscText: '',
    chargesMin: '',
    chargesMax: '',
    directorshipsMin: '',
    directorshipsMax: '',
    shareMin: '',
    shareMax: '',
    hasDomain: 'any',
    hasLinkedIn: 'any',
    minScore: null,
};

export const useFilterStore = create<FilterState & FilterActions>((set, get) => ({
    ...DEFAULT_STATE,

    setSearchQuery: (v) => set({ searchQuery: v }),
    setStatusFilter: (v) => set({ statusFilter: v }),
    setTypeFilter: (v) => set({ typeFilter: v }),
    setLocationQuery: (v) => set({ locationQuery: v }),
    setIncorporatedFrom: (v) => set({ incorporatedFrom: v }),
    setIncorporatedTo: (v) => set({ incorporatedTo: v }),
    setIndustriesInclude: (v) => set({ industriesInclude: v }),
    setIndustriesExclude: (v) => set({ industriesExclude: v }),
    setCompanyTypes: (v) => set({ companyTypes: v }),
    setDescriptionKeywordsInclude: (v) => set({ descriptionKeywordsInclude: v }),
    setDescriptionKeywordsExclude: (v) => set({ descriptionKeywordsExclude: v }),
    setOfficerName: (v) => set({ officerName: v }),
    setPscText: (v) => set({ pscText: v }),
    setChargesMin: (v) => set({ chargesMin: v }),
    setChargesMax: (v) => set({ chargesMax: v }),
    setDirectorshipsMin: (v) => set({ directorshipsMin: v }),
    setDirectorshipsMax: (v) => set({ directorshipsMax: v }),
    setShareMin: (v) => set({ shareMin: v }),
    setShareMax: (v) => set({ shareMax: v }),
    setHasDomain: (v) => set({ hasDomain: v }),
    setHasLinkedIn: (v) => set({ hasLinkedIn: v }),
    setMinScore: (v) => set({ minScore: v }),

    resetFilters: () => set({ ...DEFAULT_STATE }),

    activeFilterCount: () => {
        const s = get();
        return [
            s.searchQuery.trim() !== '',
            s.statusFilter !== null,
            s.typeFilter !== null,
            s.locationQuery.trim() !== '',
            s.incorporatedFrom.trim() !== '',
            s.incorporatedTo.trim() !== '',
            s.industriesInclude.trim() !== '',
            s.industriesExclude.trim() !== '',
            s.companyTypes.trim() !== '',
            s.descriptionKeywordsInclude.trim() !== '',
            s.descriptionKeywordsExclude.trim() !== '',
            s.officerName.trim() !== '',
            s.pscText.trim() !== '',
            s.chargesMin.trim() !== '',
            s.chargesMax.trim() !== '',
            s.directorshipsMin.trim() !== '',
            s.directorshipsMax.trim() !== '',
            s.shareMin.trim() !== '',
            s.shareMax.trim() !== '',
            s.hasDomain !== 'any',
            s.hasLinkedIn !== 'any',
            s.minScore != null,
        ].filter(Boolean).length;
    },
}));
