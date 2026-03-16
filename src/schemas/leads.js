/**
 * Zod schemas for /api/leads/* and /api/run endpoints.
 * Separated from route handlers to keep the route file under 200 lines
 * and allow reuse in tests.
 */

const path = require('path');
const { z } = require('zod');

const STATUS_VALUES = ['New', 'Enriched', 'Contacted', 'Qualified', 'Converted', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied'];
const VALID_SOURCES = ['json_file', 'companies_house', 'google_maps', 'charity_commission', 'fca_register', 'linkedin'];
const ACTIVITY_TYPES = ['note', 'status_change', 'email_sent', 'call', 'meeting', 'scored'];
const EXPORT_FORMATS = ['csv', 'xlsx', 'excel'];

const DEFAULT_PIPELINE_LIMIT = 10;
const MAX_PIPELINE_LIMIT = 500;
const MAX_DAYS_BACK = 365;

// ── Shared param schemas ─────────────────────────────────────

const leadIdParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const companyNumberParamsSchema = z.object({
    companyNumber: z.string().min(1, 'Company number is required'),
});

// ── Query schemas ────────────────────────────────────────────

const leadsQuerySchema = z.object({
    listId: z.coerce.number().int().positive().optional(),
});

const enrichedSearchQuerySchema = z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    daysBack: z.coerce.number().int().min(0).optional(),
    location: z.string().optional(),
    postcode: z.string().optional(),
    listId: z.coerce.number().int().positive().optional(),
});

const exportQuerySchema = z.object({
    format: z.enum(/** @type {[string, ...string[]]} */ (EXPORT_FORMATS)).default('csv'),
    listId: z.coerce.number().int().positive().optional(),
});

// ── Body schemas ─────────────────────────────────────────────

const leadUpdateSchema = z.object({
    status: z.enum(/** @type {[string, ...string[]]} */ (STATUS_VALUES)).optional(),
    score: z.coerce.number().int().min(1).max(10).optional(),
    outreach_draft: z.string().optional(),
    assigned_to: z.string().nullable().optional(),
    emails: z.array(z.string()).optional(),
    phones: z.array(z.string()).optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'No valid fields to update' }
);

const activityCreateSchema = z.object({
    type: z.enum(/** @type {[string, ...string[]]} */ (ACTIVITY_TYPES)).default('note'),
    content: z.string().default(''),
});

const sendEmailSchema = z.object({
    subject: z.string().default('Introduction'),
    body: z.string().optional(),
    draft: z.string().optional(),
});

const sendReplySchema = z.object({
    subject: z.string().min(1, 'Subject is required'),
    body: z.string().min(1, 'Body is required'),
});

/**
 * Pipeline run schema.
 * inputFile is restricted to .json files within the project root
 * to prevent path traversal attacks.
 */
const pipelineRunSchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_PIPELINE_LIMIT).default(DEFAULT_PIPELINE_LIMIT),
    source: z.enum(/** @type {[string, ...string[]]} */ (VALID_SOURCES)).default('json_file'),
    inputFile: z.string().optional().refine(
        (val) => {
            if (!val) return true;
            const projectRoot = process.cwd();
            const resolved = path.isAbsolute(val) ? path.normalize(val) : path.normalize(path.join(projectRoot, val));
            const withinRoot = resolved.startsWith(projectRoot + path.sep) || resolved === projectRoot;
            const isJson = resolved.endsWith('.json');
            return withinRoot && isJson;
        },
        { message: 'inputFile must be a .json file within the project directory' }
    ),
    googleMapsKeyword: z.string().optional(),
    googleMapsLocation: z.string().optional(),
    linkedInCompanyNames: z.union([z.string(), z.array(z.string())]).optional(),
    daysBack: z.coerce.number().int().min(1).max(MAX_DAYS_BACK).optional(),
});

const saveToListSchema = z.object({
    listId: z.coerce.number().int().positive({ message: 'listId (positive number) is required' }),
    companyNumbers: z.array(z.string().min(1)).min(1, 'companyNumbers (non-empty array) is required'),
});

const bulkSendEmailSchema = z.object({
    leadIds: z.array(z.coerce.number().int().positive()).min(1, 'leadIds array (at least one lead id) is required'),
    subject: z.string().default('Introduction'),
});

const bulkDeleteSchema = z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1, 'Provide ids array of lead ids to delete'),
});

const validateLeadSchema = z.object({
    useApi: z.boolean().default(false),
    company_name: z.string().optional(),
    company_number: z.string().optional(),
    address: z.string().optional(),
    postcode: z.string().optional(),
}).passthrough();

module.exports = {
    leadIdParamsSchema,
    companyNumberParamsSchema,
    leadsQuerySchema,
    enrichedSearchQuerySchema,
    exportQuerySchema,
    leadUpdateSchema,
    activityCreateSchema,
    sendEmailSchema,
    sendReplySchema,
    pipelineRunSchema,
    saveToListSchema,
    bulkSendEmailSchema,
    bulkDeleteSchema,
    validateLeadSchema,
    STATUS_VALUES,
    VALID_SOURCES,
    ACTIVITY_TYPES,
};
