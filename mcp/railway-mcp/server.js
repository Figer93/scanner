/* eslint-disable no-console */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const RAILWAY_ENDPOINT = 'https://backboard.railway.com/graphql/v2';

function getAuthHeaders({ token, tokenType }) {
  const t = token?.trim();
  if (!t) return null;

  if (tokenType === 'project') {
    return { 'Project-Access-Token': t };
  }
  return { Authorization: `Bearer ${t}` };
}

async function railwayGraphql({ token, tokenType, query, variables }) {
  const authHeaders =
    getAuthHeaders({ token, tokenType }) ||
    getAuthHeaders({
      token: process.env.RAILWAY_PROJECT_ACCESS_TOKEN,
      tokenType: 'project',
    }) ||
    getAuthHeaders({
      token: process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN,
      tokenType: 'bearer',
    });

  if (!authHeaders) {
    throw new Error(
      'Missing Railway token. Set RAILWAY_API_TOKEN (account/workspace) or RAILWAY_PROJECT_ACCESS_TOKEN (project token).'
    );
  }

  const res = await fetch(RAILWAY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      query,
      variables: variables ?? null,
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Railway API returned non-JSON (${res.status}): ${text.slice(0, 4000)}`);
  }

  if (!res.ok) {
    throw new Error(`Railway API error (${res.status}): ${JSON.stringify(json).slice(0, 4000)}`);
  }

  if (json.errors?.length) {
    throw new Error(`Railway GraphQL errors: ${JSON.stringify(json.errors).slice(0, 4000)}`);
  }

  return json.data;
}

function toolTextResponse(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text }] };
}

async function main() {
  const server = new McpServer({ name: 'railway-mcp', version: '0.1.0' });

  server.tool(
    'railway_graphql',
    'Run an arbitrary Railway GraphQL query/mutation.',
    {
      tokenType: z.enum(['bearer', 'project']).optional().default('bearer'),
      token: z.string().optional().describe('Optional token override; otherwise uses env vars'),
      query: z.string().min(1),
      variables: z.any().optional(),
    },
    async ({ tokenType, token, query, variables }) => {
      const data = await railwayGraphql({ tokenType, token, query, variables });
      return toolTextResponse(data);
    }
  );

  server.tool(
    'railway_me',
    'Get current Railway account identity (requires account token).',
    {
      token: z.string().optional(),
    },
    async ({ token }) => {
      const data = await railwayGraphql({
        tokenType: 'bearer',
        token,
        query: 'query { me { id name email } }',
        variables: null,
      });
      return toolTextResponse(data);
    }
  );

  server.tool(
    'railway_workspaces',
    'List workspaces you have access to (requires account token).',
    { token: z.string().optional() },
    async ({ token }) => {
      const data = await railwayGraphql({
        tokenType: 'bearer',
        token,
        query: 'query { me { workspaces { edges { node { id name } } } } }',
        variables: null,
      });
      return toolTextResponse(data);
    }
  );

  server.tool(
    'railway_projects',
    'List projects in a workspace.',
    {
      token: z.string().optional(),
      workspaceId: z.string().min(1),
    },
    async ({ token, workspaceId }) => {
      const data = await railwayGraphql({
        tokenType: 'bearer',
        token,
        query:
          'query($workspaceId: String!) { workspace(workspaceId: $workspaceId) { id name projects { edges { node { id name } } } } }',
        variables: { workspaceId },
      });
      return toolTextResponse(data);
    }
  );

  server.tool(
    'railway_project_services',
    'List services in a project (helps find your frontend serviceId).',
    {
      token: z.string().optional(),
      projectId: z.string().min(1),
    },
    async ({ token, projectId }) => {
      const data = await railwayGraphql({
        tokenType: 'bearer',
        token,
        query:
          'query($projectId: String!) { project(id: $projectId) { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }',
        variables: { projectId },
      });
      return toolTextResponse(data);
    }
  );

  server.tool(
    'railway_status',
    'Full monitoring summary: project, services, latest deployment status, public domains, and live /api/health. Use with project token (RAILWAY_PROJECT_ACCESS_TOKEN) so the assistant can check builds and health without user input.',
    {
      token: z.string().optional().describe('Optional project token override'),
      checkHealth: z.boolean().optional().default(true).describe('Fetch GET /api/health from each service public URL'),
    },
    async ({ token, checkHealth }) => {
      const auth =
        getAuthHeaders({ token: token ?? process.env.RAILWAY_PROJECT_ACCESS_TOKEN, tokenType: 'project' }) ??
        getAuthHeaders({ token: process.env.RAILWAY_TOKEN, tokenType: 'project' });
      if (!auth) {
        return toolTextResponse({
          error: 'Missing Railway project token. Set RAILWAY_PROJECT_ACCESS_TOKEN or RAILWAY_TOKEN.',
        });
      }
      const gql = (query, variables) =>
        fetch(RAILWAY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ query, variables }),
        }).then((r) => r.json());

      const tokenData = (await gql('query { projectToken { projectId environmentId } }')).data?.projectToken;
      if (!tokenData) {
        const err = (await gql('query { projectToken { projectId } }')).errors;
        return toolTextResponse({ error: 'Invalid or missing project token.', details: err });
      }
      const { projectId, environmentId } = tokenData;

      const proj = (await gql(
        'query($id: String!) { project(id: $id) { id name services { edges { node { id name } } } } }',
        { id: projectId }
      )).data?.project;
      if (!proj) return toolTextResponse({ error: 'Project not found.', projectId });

      const summary = {
        project: { id: proj.id, name: proj.name },
        environmentId,
        services: [],
      };

      for (const edge of proj.services?.edges ?? []) {
        const svc = edge.node;
        const inst = (await gql(
          `query($sid: String!, $eid: String!) {
            serviceInstance(serviceId: $sid, environmentId: $eid) {
              serviceName
              domains { serviceDomains { domain } customDomains { domain } }
              latestDeployment { id status createdAt meta { commitMessage commitHash } }
            }
          }`,
          { sid: svc.id, eid: environmentId }
        )).data?.serviceInstance;

        const row = {
          serviceId: svc.id,
          name: svc.name,
          latestDeployment: inst?.latestDeployment ?? null,
          domains: [],
          health: null,
        };
        const domains = [
          ...(inst?.domains?.serviceDomains?.map((d) => d.domain) ?? []),
          ...(inst?.domains?.customDomains?.map((d) => d.domain) ?? []),
        ].filter(Boolean);
        row.domains = domains;

        if (checkHealth && domains.length > 0) {
          const base = domains[0].startsWith('http') ? domains[0] : `https://${domains[0]}`;
          try {
            const healthRes = await fetch(`${base.replace(/\/$/, '')}/api/health`, {
              method: 'GET',
              signal: AbortSignal.timeout(8000),
            });
            const healthJson = await healthRes.json().catch(() => ({}));
            row.health = { status: healthRes.status, body: healthJson };
          } catch (e) {
            row.health = { error: e.message || String(e) };
          }
        }
        summary.services.push(row);
      }
      return toolTextResponse(summary);
    }
  );

  server.tool(
    'railway_deploy',
    'Trigger a deployment for a service in an environment.',
    {
      token: z.string().optional(),
      tokenType: z.enum(['bearer', 'project']).optional().default('bearer'),
      serviceId: z.string().min(1),
      environmentId: z.string().min(1),
      mode: z.enum(['deploy', 'redeploy']).optional().default('deploy'),
      v2: z.boolean().optional().default(true).describe('Use V2 deploy mutation when mode=deploy'),
    },
    async ({ token, tokenType, serviceId, environmentId, mode, v2 }) => {
      const mutation =
        mode === 'redeploy'
          ? 'mutation($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }'
          : v2
            ? 'mutation($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }'
            : 'mutation($serviceId: String!, $environmentId: String!) { serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId) }';

      const data = await railwayGraphql({
        tokenType,
        token,
        query: mutation,
        variables: { serviceId, environmentId },
      });
      return toolTextResponse(data);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

