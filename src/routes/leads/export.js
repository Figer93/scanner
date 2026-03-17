/**
 * GET /api/leads/export — CSV and XLSX download.
 */

const XLSX = require('xlsx');
const { getDb, getAllLeads, getLeadsByListId } = require('../../services/database');
const { validateQuery } = require('../../middleware/validate');
const logger = require('../../lib/logger');
const { exportQuerySchema } = require('../../schemas/leads');

const XLSX_HEADERS = ['id', 'company_name', 'company_number', 'address', 'postcode', 'website', 'emails', 'phones', 'contact_form', 'status', 'score', 'ice_breaker', 'outreach_draft', 'source', 'website_services', 'website_size', 'website_tech', 'assigned_to', 'created_at', 'updated_at'];
const CSV_HEADERS  = ['id', 'company_name', 'company_number', 'address', 'postcode', 'website', 'emails', 'phones', 'contact_form', 'status', 'score', 'ice_breaker', 'outreach_draft', 'source', 'assigned_to', 'created_at', 'updated_at'];

function escapeCsvCell(value) {
    if (value == null) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function mountLeadsExport(app) {
    app.get('/api/leads/export', validateQuery(exportQuerySchema), async (req, res) => {
        const { format, listId } = req.query;
        try {
            const db = await getDb();
            const leads = (Number.isInteger(listId) && listId >= 1)
                ? getLeadsByListId(db, listId)
                : getAllLeads(db);

            if (format === 'xlsx' || format === 'excel') {
                const rows = leads.map((lead) => {
                    const emailsStr = Array.isArray(lead.emails) ? lead.emails.join('; ') : (lead.emails || '');
                    const phonesStr = Array.isArray(lead.phones) ? lead.phones.join('; ') : (lead.phones || '');
                    const o = {};
                    XLSX_HEADERS.forEach((h) => {
                        let v = lead[h];
                        if (h === 'emails') v = emailsStr;
                        else if (h === 'phones') v = phonesStr;
                        else if (h === 'contact_form') v = lead.contact_form ? 1 : 0;
                        o[h] = v ?? '';
                    });
                    return o;
                });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, 'Leads');
                const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');
                res.send(buf);
                return;
            }

            const rows = [CSV_HEADERS.join(',')];
            for (const lead of leads) {
                const emailsStr = Array.isArray(lead.emails) ? lead.emails.join('; ') : (lead.emails || '');
                const phonesStr = Array.isArray(lead.phones) ? lead.phones.join('; ') : (lead.phones || '');
                const contactForm = lead.contact_form ? '1' : '0';
                rows.push(CSV_HEADERS.map((h) => {
                    if (h === 'emails') return escapeCsvCell(emailsStr);
                    if (h === 'phones') return escapeCsvCell(phonesStr);
                    if (h === 'contact_form') return escapeCsvCell(contactForm);
                    if (h === 'outreach_draft') return escapeCsvCell(lead.outreach_draft);
                    return escapeCsvCell(lead[h]);
                }).join(','));
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
            res.send(rows.join('\r\n'));
        } catch (err) {
            logger.error({ err }, 'Failed to export leads');
            res.status(500).json({ error: 'Failed to export leads' });
        }
    });
}

module.exports = { mountLeadsExport };
