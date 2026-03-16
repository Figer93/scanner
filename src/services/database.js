/**
 * Barrel re-export — preserves the existing import contract.
 *
 * All 20+ files that require('../services/database') or require('./database')
 * continue to work unchanged. The actual logic now lives in src/db/*.js.
 */

const connection = require('../db/connection');
const schema = require('../db/schema');
const leads = require('../db/leads');
const chCache = require('../db/chCache');
const enrichedLeads = require('../db/enrichedLeads');
const lists = require('../db/lists');
const emailTemplates = require('../db/emailTemplates');
const sequences = require('../db/sequences');
const analytics = require('../db/analytics');
const earnings = require('../db/earnings');
const profile = require('../db/profile');

module.exports = {
    ...connection,
    ...schema,
    ...leads,
    ...chCache,
    ...enrichedLeads,
    ...lists,
    ...emailTemplates,
    ...sequences,
    ...analytics,
    ...earnings,
    ...profile,
};
