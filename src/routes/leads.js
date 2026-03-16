/**
 * Leads route orchestrator.
 *
 * Mounts all four sub-modules in the order that preserves Express route-matching
 * semantics: static paths are registered before the /:id wildcard.
 *
 * Registration order:
 *   1. crud      — GET /api/leads, static lookups, bulk ops, /:id CRUD, activities
 *   2. export    — GET /api/leads/export (registered before /:id in crud, but
 *                  isolated here for clarity; both orderings are safe because
 *                  Express path-matches /export before /:id regardless)
 *   3. ai        — POST /api/leads/:id/score|outreach-draft|sync|enrich
 *   4. pipeline  — POST /api/run (separate root path, no wildcard conflict)
 */

const { mountLeadsCrud } = require('./leads/crud');
const { mountLeadsExport } = require('./leads/export');
const { mountLeadsAi } = require('./leads/ai');
const { mountLeadsPipeline } = require('./leads/pipeline');

function mountLeads(app) {
    mountLeadsCrud(app);
    mountLeadsExport(app);
    mountLeadsAi(app);
    mountLeadsPipeline(app);
}

module.exports = { mountLeads };
