import './StatusBadge.css';

export default function StatusBadge({ status }) {
    const normalized = (status || '').toLowerCase().replace(/\s+/g, '-');
    let className = 'status-badge status-badge--unknown';
    if (normalized === 'new') className = 'status-badge status-badge--new';
    else if (normalized === 'enriched') className = 'status-badge status-badge--enriched';
    else if (normalized === 'email-sent' || normalized === 'contacted' || normalized === 'pending') className = 'status-badge status-badge--pending';
    else if (normalized === 'opened') className = 'status-badge status-badge--opened';
    else if (normalized === 'waiting-for-reply') className = 'status-badge status-badge--waiting';
    else if (normalized === 'replied' || normalized === 'qualified') className = 'status-badge status-badge--qualified';
    else if (normalized === 'converted') className = 'status-badge status-badge--converted';
    return <span className={className}>{status || '—'}</span>;
}
