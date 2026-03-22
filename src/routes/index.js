/**
 * Aggregates all route modules and mounts them on the Express app.
 * Pass context (e.g. startScheduledRuns) for routes that need it.
 */

const { mountHealth } = require('./health');
const { mountAuth } = require('./auth');
const { mountLogs } = require('./logs');
const { mountCompaniesHouse } = require('./companiesHouse');
const { mountLeads } = require('./leads');
const { mountChCache } = require('./chCache');
const { mountLists } = require('./lists');
const { mountEmailTemplates } = require('./emailTemplates');
const { mountEmailLogs } = require('./emailLogs');
const { mountEmailSignature } = require('./emailSignature');
const { mountSequences } = require('./sequences');
const { mountProfile } = require('./profile');
const { mountUsage } = require('./usage');
const { mountAnalytics } = require('./analytics');
const { mountEarnings } = require('./earnings');
const { mountDb } = require('./db');
const { mountCrm } = require('./crm');
const { mountSchedule } = require('./schedule');
const { mountAuditWebhooks } = require('./auditWebhooks');
const { mountWelcome } = require('./welcome');
const { mountEnrichment } = require('./enrichment');

function mountAll(app, context = {}) {
    mountHealth(app);
    mountAuth(app);
    mountLogs(app);
    mountCompaniesHouse(app);
    mountLeads(app);
    mountChCache(app);
    mountLists(app);
    mountEmailTemplates(app);
    mountEmailLogs(app);
    mountEmailSignature(app);
    mountSequences(app);
    mountProfile(app);
    mountUsage(app);
    mountAnalytics(app);
    mountEarnings(app);
    mountDb(app);
    mountCrm(app);
    mountSchedule(app, context);
    mountAuditWebhooks(app);
    mountWelcome(app);
    mountEnrichment(app, context);
}

module.exports = { mountAll };
