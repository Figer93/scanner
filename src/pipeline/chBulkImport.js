/**
 * Companies House advanced search: paged import into leads, skip existing company_number.
 */

const axios = require('axios');
const { upsertLead } = require('../db/leads');
const { STATUS, LEAD_SOURCE } = require('../db/connection');
const logger = require('../lib/logger');

const CH_BASE = 'https://api.company-information.service.gov.uk';
const PAGE_SIZE = 100;
const MAX_TOTAL = 10000;

/**
 * @param {object} item - CH advanced search item
 */
function mapChItemToLeadPayload(item) {
    const c = item || {};
    const addr = c.registered_office_address || {};
    const line1 = addr.address_line_1 || '';
    const postcode = addr.postal_code || '';
    const address = [line1, addr.locality, postcode].filter(Boolean).join(', ');
    const meta = {
        company_status: c.company_status,
        sic_codes: c.sic_codes,
        jurisdiction: c.jurisdiction || c.company_location || null,
        company_type: c.company_type,
        raw_search_hit: c,
    };
    return {
        company_name: c.company_name || '',
        company_number: c.company_number || '',
        address,
        postcode,
        date_of_creation: c.date_of_creation || null,
        source_metadata: meta,
        source: LEAD_SOURCE.COMPANIES_HOUSE,
        status: STATUS.NEW,
    };
}

/**
 * @param {{
 *   db: import('../db/connection').Db,
 *   apiKey: string,
 *   filters: {
 *     sicCodes?: string[],
 *     incorporatedFrom?: string,
 *     incorporatedTo?: string,
 *     companyStatus?: string,
 *     jurisdiction?: string,
 *   },
 *   jobId: string,
 *   io: import('socket.io').Server | null,
 * }} opts
 * @returns {Promise<{ leadIds: number[], imported: number, skipped: number }>}
 */
async function runChBulkImport(opts) {
    const { db, apiKey, filters, jobId, io } = opts;
    const auth = Buffer.from(String(apiKey).trim() + ':').toString('base64');

    const incorporatedFrom = filters.incorporatedFrom || filters.incorporated_from;
    const incorporatedTo = filters.incorporatedTo || filters.incorporated_to;
    if (!incorporatedFrom || !incorporatedTo) {
        throw new Error('incorporatedFrom and incorporatedTo are required (YYYY-MM-DD)');
    }

    const leadIds = [];
    let imported = 0;
    let skipped = 0;
    let startIndex = 0;
    let total = 0;

    while (startIndex < MAX_TOTAL) {
        // Query param names must match Companies House API (same as src/services/companiesHouse.js — `status`, not `company_status`).
        const params = {
            incorporated_from: incorporatedFrom,
            incorporated_to: incorporatedTo,
            size: PAGE_SIZE,
        };
        if (startIndex > 0) {
            params.start_index = startIndex;
        }
        if (filters.companyStatus && String(filters.companyStatus).toLowerCase() !== 'all') {
            params.status = filters.companyStatus;
        }
        const sicCodes = filters.sicCodes || filters.sic_codes;
        if (Array.isArray(sicCodes) && sicCodes.length > 0) {
            params.sic_codes = sicCodes.filter(Boolean).join(',');
        } else if (typeof sicCodes === 'string' && sicCodes.trim()) {
            params.sic_codes = sicCodes.trim();
        }
        if (filters.jurisdiction || filters.location) {
            params.location = filters.jurisdiction || filters.location;
        }

        let response;
        try {
            response = await axios.get(CH_BASE + '/advanced-search/companies', {
                params,
                headers: { Authorization: `Basic ${auth}` },
                timeout: 30000,
                validateStatus: () => true,
            });
        } catch (err) {
            const msg = err.message || String(err);
            logger.error({ err: msg, incorporatedFrom, incorporatedTo }, 'CH advanced-search request failed');
            throw new Error(`Companies House request failed: ${msg}`);
        }

        if (response.status < 200 || response.status >= 300) {
            const body = response.data;
            const snippet =
                typeof body === 'object' && body !== null
                    ? JSON.stringify(body).slice(0, 500)
                    : String(body || '').slice(0, 500);
            const errMsg = `Companies House API ${response.status}: ${snippet || response.statusText}`;
            logger.error({ status: response.status, body: snippet }, 'CH advanced-search non-OK');
            throw new Error(errMsg);
        }

        const items = response.data?.items || [];
        total = response.data?.total_count != null ? response.data.total_count : startIndex + items.length;

        if (items.length === 0) break;

        for (const item of items) {
            if (imported + skipped >= MAX_TOTAL) break;
            const num = String(item.company_number || '').trim();
            if (!num) continue;

            const exists = await db.queryOne('SELECT 1 FROM leads WHERE company_number = $1', [num]);
            if (exists) {
                skipped++;
                continue;
            }

            const payload = mapChItemToLeadPayload(item);
            const out = await upsertLead(db, payload);
            if (out && out.inserted && out.id) {
                leadIds.push(out.id);
                imported++;
                try {
                    await db.run(
                        `UPDATE leads SET enrichment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        ['pending', out.id]
                    );
                } catch (err) {
                    logger.warn({ err: err.message }, 'set enrichment_status pending');
                }
            } else if (out && !out.inserted) {
                skipped++;
            }
        }

        if (io) {
            io.emit('pipeline:progress', {
                jobId,
                processed: imported,
                total: Math.min(total, MAX_TOTAL),
                failed: 0,
            });
        }

        startIndex += items.length;
        if (items.length < PAGE_SIZE || startIndex >= MAX_TOTAL) break;
        if (startIndex >= (response.data?.total_count ?? Infinity)) break;
    }

    try {
        await db.run(
            `UPDATE enrichment_jobs SET total_companies = $1, filters = COALESCE(filters, '{}'::jsonb) || $2::jsonb WHERE id = $3::uuid`,
            [leadIds.length, JSON.stringify({ leadIds }), jobId]
        );
    } catch (err) {
        logger.warn({ err: err.message }, 'update job total_companies');
    }

    return { leadIds, imported, skipped };
}

module.exports = { runChBulkImport, mapChItemToLeadPayload, CH_BASE, PAGE_SIZE, MAX_TOTAL };
