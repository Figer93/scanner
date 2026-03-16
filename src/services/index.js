/**
 * Barrel file: re-export public API from all services.
 * Route modules can require('./services') or require('./services/database') as needed.
 */

const database = require('./database');
const usageTracker = require('./usageTracker');
const ai = require('./ai');
const companiesHouse = require('./companiesHouse');
const companiesHouseCache = require('./companiesHouseCache');
const leadValidator = require('./leadValidator');
const crmPush = require('./crmPush');
const leadEnrichment = require('./leadEnrichment');
const search = require('./search');
const scraper = require('./scraper');
const linkedin = require('./linkedin');
const googleMaps = require('./googleMaps');
const ukSources = require('./ukSources');

module.exports = {
    ...database,
    ...usageTracker,
    ...ai,
    ...companiesHouse,
    ...companiesHouseCache,
    ...leadValidator,
    ...crmPush,
    ...leadEnrichment,
    ...search,
    ...scraper,
    ...linkedin,
    ...googleMaps,
    ...ukSources
};
