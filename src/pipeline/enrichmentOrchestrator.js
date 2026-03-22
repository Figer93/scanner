/**
 * Runs deep enrichment stages for a single lead with per-stage timeouts and logging.
 */

const logger = require('../lib/logger');
const { getLeadById } = require('../services/database');
const { findWebsiteForLead } = require('./websiteFinder');
const { scrapeWebsiteContacts } = require('./websiteScraper');
const { enrichLinkedIn } = require('./linkedinEnricher');
const { validateEnrichment } = require('./validator');
const { insertEnrichmentLog, upsertCompanyContacts, applyLeadEnrichmentUpdate } = require('./dbUpdater');

const STAGE_MS = 5000;

/**
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @param {string} label
 */
async function withTimeout(p, ms, label) {
    let timer;
    try {
        return await Promise.race([
            p,
            new Promise((_, rej) => {
                timer = setTimeout(() => rej(new Error(`${label}:timeout`)), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {object} profile
 * @param {string} key
 */
function stageOn(profile, key) {
    const v = profile[key];
    if (v == null || v === '') return true;
    return v === 'true' || v === '1';
}

/**
 * @param {{
 *   db: import('../db/connection').Db,
 *   jobId: string | null,
 *   leadId: number,
 *   profile: Record<string, string>,
 *   limits: {
 *     serperAcquire: () => Promise<void>,
 *     apifyAcquire: () => Promise<void>,
 *     playwrightSemaphore: import('./tokenBucket').ConcurrencySemaphore,
 *     getBrowser: () => Promise<import('playwright').Browser>,
 *   },
 *   io: import('socket.io').Server | null,
 * }} ctx
 * @returns {Promise<{ ok: boolean, score: number, durationMs: number, error?: string, stage?: string }>}
 */
async function runEnrichmentForLead(ctx) {
    const { db, jobId, leadId, profile, limits, io } = ctx;
    const t0 = Date.now();
    const log = logger.child({ leadId, jobId });

    const lead = await getLeadById(db, leadId);
    if (!lead) {
        return { ok: false, score: 0, durationMs: 0, error: 'lead_not_found' };
    }

    try {
    const serperKey = (profile.serper_api_key || process.env.SERPER_API_KEY || '').trim();
    const apifyKey = (profile.apify_api_token || process.env.APIFY_API_TOKEN || '').trim();
    const actorId = (profile.apify_linkedin_actor_id || process.env.APIFY_LINKEDIN_ACTOR_ID || '').trim();
    const chKey = (profile.companies_house_api_key || process.env.COMPANIES_HOUSE_API_KEY || '').trim();
    const apifyLinkedinEnabled = profile.apify_linkedin_enabled === 'true' || profile.apify_linkedin_enabled === '1';

    let website = lead.website || null;
    let website_status = lead.website_status || null;
    let website_checked_at = lead.website_checked_at || null;
    let emails = Array.isArray(lead.emails) ? [...lead.emails] : [];
    let phones = Array.isArray(lead.phones) ? [...lead.phones] : [];
    let linkedin_url = lead.linkedin_url || null;
    /** @type {object} */
    let source_metadata = lead.source_metadata && typeof lead.source_metadata === 'object' ? { ...lead.source_metadata } : {};

    const emitStage = (stage, status) => {
        if (io) io.emit('enrichment:stage', { leadId, stage, status });
    };

    try {
        await db.run(`UPDATE leads SET enrichment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, ['running', leadId]);
    } catch (err) {
        log.warn({ err: err.message }, 'failed to set running');
    }

    /** @type {string[]} */
    const liPersonUrls = [];
    let liCompanyFromSerper = null;

    if (stageOn(profile, 'enrichment_stage_website_find')) {
        const s0 = Date.now();
        emitStage('website_find', 'running');
        try {
            const r = await withTimeout(
                findWebsiteForLead({
                    companyName: lead.company_name,
                    existingWebsite: lead.website,
                    apiKey: serperKey,
                    serperAcquire: limits.serperAcquire,
                    logger: log,
                }),
                STAGE_MS,
                'website_find'
            );
            website = r.website;
            website_status = r.website_status;
            website_checked_at = r.website_checked_at;
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'website_find',
                status: 'success',
                duration_ms: Date.now() - s0,
                detail: { website_status },
            });
            emitStage('website_find', 'success');
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'website_find',
                status: msg.includes('timeout') ? 'timeout' : 'failed',
                duration_ms: Date.now() - s0,
                detail: { error: msg },
            });
            emitStage('website_find', 'failed');
            if (io) io.emit('enrichment:error', { leadId, stage: 'website_find', error: msg });
        }
    }

    if (stageOn(profile, 'enrichment_stage_scrape') && website_status === 'found' && website) {
        const s0 = Date.now();
        emitStage('website_scrape', 'running');
        try {
            const scraped = await withTimeout(
                scrapeWebsiteContacts({
                    websiteBaseUrl: website,
                    playwrightSemaphore: limits.playwrightSemaphore,
                    getBrowser: limits.getBrowser,
                    logger: log,
                }),
                STAGE_MS,
                'website_scrape'
            );
            emails = [...new Set([...emails, ...scraped.emails])];
            phones = [...new Set([...phones, ...scraped.phones])];
            const contacts = [];
            for (const e of scraped.emails) {
                contacts.push({ type: 'email', value: e, source: 'website_scrape' });
            }
            for (const ph of scraped.phones) {
                contacts.push({ type: 'phone', value: ph, source: 'website_scrape' });
            }
            for (const u of scraped.linkedinCompanyUrls) {
                contacts.push({ type: 'linkedin_company', value: u, source: 'website_scrape' });
                linkedin_url = linkedin_url || u;
            }
            for (const u of scraped.linkedinPersonUrls) {
                contacts.push({ type: 'linkedin_person', value: u, source: 'website_scrape' });
                liPersonUrls.push(u);
            }
            await upsertCompanyContacts(db, leadId, contacts);
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'website_scrape',
                status: 'success',
                duration_ms: Date.now() - s0,
                detail: { emails: scraped.emails.length, phones: scraped.phones.length },
            });
            emitStage('website_scrape', 'success');
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'website_scrape',
                status: msg.includes('timeout') ? 'timeout' : 'failed',
                duration_ms: Date.now() - s0,
                detail: { error: msg },
            });
            emitStage('website_scrape', 'failed');
            if (io) io.emit('enrichment:error', { leadId, stage: 'website_scrape', error: msg });
        }
    }

    if (stageOn(profile, 'enrichment_stage_linkedin')) {
        const s0 = Date.now();
        emitStage('linkedin', 'running');
        try {
            const li = await withTimeout(
                enrichLinkedIn({
                    companyName: lead.company_name,
                    lead: { ...lead, source_metadata },
                    apiKeys: {
                        serper: serperKey,
                        apify: apifyKey,
                        actorId,
                        companies_house: chKey,
                    },
                    serperAcquire: limits.serperAcquire,
                    apifyAcquire: limits.apifyAcquire,
                    apifyLinkedinEnabled,
                    logger: log,
                }),
                STAGE_MS,
                'linkedin'
            );
            source_metadata = li.updatedSourceMetadata || source_metadata;
            liCompanyFromSerper = li.companyUrl;
            if (li.companyUrl) {
                linkedin_url = li.companyUrl;
                await upsertCompanyContacts(db, leadId, [
                    { type: 'linkedin_company', value: li.companyUrl, source: 'serper_search' },
                ]);
            }
            for (const u of li.personUrls) {
                liPersonUrls.push(u);
                await upsertCompanyContacts(db, leadId, [
                    { type: 'linkedin_person', value: u, source: 'serper_search' },
                ]);
            }
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'linkedin',
                status: 'success',
                duration_ms: Date.now() - s0,
                detail: { company: !!li.companyUrl, persons: li.personUrls.length },
            });
            emitStage('linkedin', 'success');
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'linkedin',
                status: msg.includes('timeout') ? 'timeout' : 'failed',
                duration_ms: Date.now() - s0,
                detail: { error: msg },
            });
            emitStage('linkedin', 'failed');
            if (io) io.emit('enrichment:error', { leadId, stage: 'linkedin', error: msg });
        }
    }

    const bestEmail = (emails && emails[0]) || lead.predicted_email || null;

    let val = {
        email_valid: false,
        website_valid: false,
        phone_valid: false,
        linkedin_company_valid: false,
        linkedin_person_valid: false,
        enrichment_score: 0,
    };

    if (stageOn(profile, 'enrichment_stage_validate')) {
        const s0 = Date.now();
        emitStage('validate', 'running');
        try {
            val = await withTimeout(
                validateEnrichment({
                    bestEmail,
                    website: website && website_status === 'found' ? website : null,
                    phones,
                    linkedinCompanyUrl: linkedin_url || liCompanyFromSerper,
                    linkedinPersonUrls: liPersonUrls,
                }),
                3000,
                'validate'
            );
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'validate',
                status: 'success',
                duration_ms: Date.now() - s0,
                detail: { score: val.enrichment_score },
            });
            emitStage('validate', 'success');
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            await insertEnrichmentLog(db, {
                lead_id: leadId,
                job_id: jobId,
                stage: 'validate',
                status: msg.includes('timeout') ? 'timeout' : 'failed',
                duration_ms: Date.now() - s0,
                detail: { error: msg },
            });
            emitStage('validate', 'failed');
        }
    } else {
        let s = 0;
        if (bestEmail) s += 25;
        if (website && website_status === 'found') s += 20;
        if (phones && phones.some((p) => /^\+44[1-9]\d{8,9}$/.test(String(p).replace(/\s/g, '')))) s += 20;
        if (linkedin_url || liCompanyFromSerper) s += 20;
        if (liPersonUrls.length > 0) s += 15;
        val = {
            email_valid: !!bestEmail,
            website_valid: !!(website && website_status === 'found'),
            phone_valid: s >= 45,
            linkedin_company_valid: !!(linkedin_url || liCompanyFromSerper),
            linkedin_person_valid: liPersonUrls.length > 0,
            enrichment_score: Math.min(100, s),
        };
    }

    const enrichment_status = val.enrichment_score >= 25 ? 'enriched' : 'enriched_partial';

    const sDb = Date.now();
    try {
        await applyLeadEnrichmentUpdate(db, leadId, jobId, {
            website,
            emails,
            phones,
            linkedin_url,
            predicted_email: bestEmail,
            enrichment_score: val.enrichment_score,
            enrichment_status,
            website_status,
            website_checked_at,
            email_valid: val.email_valid,
            source_metadata,
        });
        await insertEnrichmentLog(db, {
            lead_id: leadId,
            job_id: jobId,
            stage: 'db_update',
            status: 'success',
            duration_ms: Date.now() - sDb,
            detail: {},
        });
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        await insertEnrichmentLog(db, {
            lead_id: leadId,
            job_id: jobId,
            stage: 'db_update',
            status: 'failed',
            duration_ms: Date.now() - sDb,
            detail: { error: msg },
        });
        if (io) io.emit('enrichment:error', { leadId, stage: 'db_update', error: msg });
        const durationMs = Date.now() - t0;
        return { ok: false, score: val.enrichment_score, durationMs, error: msg };
    }

    const durationMs = Date.now() - t0;
    if (io) io.emit('enrichment:done', { leadId, score: val.enrichment_score, durationMs });

    return { ok: true, score: val.enrichment_score, durationMs };
    } catch (outerErr) {
        log.error({ err: outerErr }, 'runEnrichmentForLead');
        try {
            await db.run(`UPDATE leads SET enrichment_status = $1 WHERE id = $2`, ['failed', leadId]);
        } catch (_) { /* ignore */ }
        if (io) io.emit('enrichment:error', { leadId, stage: 'orchestrator', error: String(outerErr && outerErr.message) });
        return { ok: false, score: 0, durationMs: Date.now() - t0, error: String(outerErr && outerErr.message) };
    }
}

module.exports = { runEnrichmentForLead, stageOn };
