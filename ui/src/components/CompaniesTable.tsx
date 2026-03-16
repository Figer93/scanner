/**
 * CompaniesTable — sortable company table with row selection.
 */

import { useRef, useEffect, memo } from 'react';
import EmptyState from './ui/EmptyState';
import { Building2 } from 'lucide-react';
import { getStatusVariant, statusVariantClasses, capitalize, formatDate } from '../lib/utils';
import type { CHCompany } from '../lib/leadFilters';

interface CompaniesTableProps {
    companies: CHCompany[];
    loading: boolean;
    selectedIds?: Set<string>;
    onSelectionChange?: (ids: Set<string>) => void;
    onCompanyClick?: (company: CHCompany) => void;
    companyInListsMap?: Record<string, string[]>;
}

const SKELETON_ROWS = 8;

function SkeletonCell({ width }: { width: string }) {
    return <td className="py-2.5 px-4"><span className={`inline-block h-3.5 ${width} bg-white/10 rounded animate-pulse`} /></td>;
}

function CompaniesTableInner({
    companies, loading, selectedIds = new Set(), onSelectionChange, onCompanyClick, companyInListsMap = {}
}: CompaniesTableProps) {
    const selectAllRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const el = selectAllRef.current;
        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < (companies?.length || 0);
    }, [selectedIds.size, companies?.length]);

    const toggleSelect = (number: string) => {
        if (!onSelectionChange || !number) return;
        const next = new Set(selectedIds);
        if (next.has(number)) next.delete(number); else next.add(number);
        onSelectionChange(next);
    };

    const toggleSelectAll = () => {
        if (!onSelectionChange || !companies?.length) return;
        if (selectedIds.size >= companies.length) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(companies.map((c) => c.number ?? c.company_number ?? '').filter(Boolean)));
        }
    };

    const headerCls = 'py-2.5 px-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider bg-white/5 border-b border-white/10';

    const HeaderRow = () => (
        <tr>
            <th scope="col" className={`w-11 ${headerCls}`}>
                {onSelectionChange && (
                    <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]" checked={companies.length > 0 && selectedIds.size === companies.length} ref={selectAllRef} onChange={toggleSelectAll} aria-label="Select all" />
                )}
            </th>
            <th scope="col" className={headerCls}>#</th>
            <th scope="col" className={headerCls}>Name</th>
            <th scope="col" className={headerCls}>Company Number</th>
            <th scope="col" className={headerCls}>Status</th>
            <th scope="col" className={headerCls}>Type</th>
            <th scope="col" className={headerCls}>Incorporation Date</th>
            <th scope="col" className={headerCls}>In lists</th>
            <th scope="col" className={headerCls}>Address</th>
        </tr>
    );

    if (loading && (!companies || companies.length === 0)) {
        return (
            <div className="overflow-auto">
                <table className="w-full border-collapse text-sm" aria-label="Companies loading">
                    <caption className="sr-only">Companies table loading</caption>
                    <thead><HeaderRow /></thead>
                    <tbody>
                        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                            <tr key={i} className="border-b border-white/5">
                                <SkeletonCell width="w-4" />
                                <SkeletonCell width="w-8" />
                                <SkeletonCell width="w-32" />
                                <SkeletonCell width="w-24" />
                                <SkeletonCell width="w-16" />
                                <SkeletonCell width="w-20" />
                                <SkeletonCell width="w-24" />
                                <SkeletonCell width="w-16" />
                                <SkeletonCell width="w-40" />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    if (!companies || companies.length === 0) {
        return <EmptyState icon={Building2} title="No companies to display" compact />;
    }

    const statusBadgeCls = (status: string) => {
        const [text, bg] = statusVariantClasses(getStatusVariant(status));
        return `${text} ${bg} border border-current/20`;
    };

    return (
        <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Companies list">
                <caption className="sr-only">List of companies from the Companies House cache</caption>
                <thead><HeaderRow /></thead>
                <tbody>
                    {companies.map((company, index) => {
                        const meta = company.source_metadata || {};
                        const status = String(meta.company_status || company.company_status || '');
                        const type = String(meta.type || meta.company_type || company.type || company.company_type || '');
                        const incorpDate = String(company.date_of_creation || meta.date_of_creation || meta.dateOfCreation || '');
                        const number = company.number || company.company_number || '';
                        const name = company.name || company.company_name || '—';
                        const address = company.address || '—';
                        const isSelected = !!number && selectedIds.has(number);
                        const rawLists = number && (companyInListsMap[number] ?? companyInListsMap[String(number).replace(/^0+/, '')] ?? (/\d+/.test(number) ? companyInListsMap[String(number).padStart(8, '0')] : undefined));
                        const listNames = Array.isArray(rawLists) ? rawLists : [];
                        return (
                            <tr key={number || index} className={`border-b border-white/5 hover:bg-white/5 ${listNames.length ? 'bg-indigo-500/5' : ''}`}>
                                <td className="w-11 py-2.5 px-4">
                                    {onSelectionChange && number && (
                                        <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]" checked={isSelected} onChange={() => toggleSelect(number)} aria-label={`Select ${name}`} />
                                    )}
                                </td>
                                <td className="py-2.5 px-4 text-white/80">{index + 1}</td>
                                <td className="py-2.5 px-4">
                                    {onCompanyClick ? (
                                        <button type="button" className="font-medium text-indigo-300 hover:text-indigo-200 hover:underline text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] rounded" onClick={() => onCompanyClick(company)}>{name}</button>
                                    ) : (
                                        <span className="text-white/80">{name}</span>
                                    )}
                                </td>
                                <td className="py-2.5 px-4">
                                    <span className="inline-block px-2 py-0.5 text-xs font-mono text-white/70 bg-white/10 border border-white/10 rounded-md">{number || '—'}</span>
                                </td>
                                <td className="py-2.5 px-4">
                                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-md ${statusBadgeCls(status)}`}>{capitalize(status) || '—'}</span>
                                </td>
                                <td className="py-2.5 px-4 text-white/70">{type ? capitalize(String(type).replace(/-/g, ' ')) : '—'}</td>
                                <td className="py-2.5 px-4 text-white/70">{formatDate(incorpDate)}</td>
                                <td className="py-2.5 px-4">
                                    {listNames.length > 0 ? (
                                        <span className="inline-block px-2 py-0.5 text-xs text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 rounded-md max-w-[180px] truncate" title={listNames.join(', ')}>
                                            In list{listNames.length > 1 ? 's' : ''}: {listNames.slice(0, 2).join(', ')}{listNames.length > 2 ? ` +${listNames.length - 2}` : ''}
                                        </span>
                                    ) : (
                                        <span className="text-white/50">—</span>
                                    )}
                                </td>
                                <td className="py-2.5 px-4 text-white/70">{address}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default memo(CompaniesTableInner);
