#!/usr/bin/env node
/**
 * Full Railway status: project, services, latest deployment, domains, and live /api/health.
 * Uses RAILWAY_PROJECT_ACCESS_TOKEN from env (or .env via dotenv if present).
 * Run: node scripts/railway-status.js
 */
require('dotenv').config();

const RAILWAY_ENDPOINT = 'https://backboard.railway.com/graphql/v2';

function getToken() {
  return process.env.RAILWAY_PROJECT_ACCESS_TOKEN || process.env.RAILWAY_TOKEN;
}

async function gql(token, query, variables = null) {
  const res = await fetch(RAILWAY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  return json.data;
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error('Set RAILWAY_PROJECT_ACCESS_TOKEN (or RAILWAY_TOKEN) in .env or env.');
    process.exit(1);
  }

  const tokenData = await gql(token, 'query { projectToken { projectId environmentId } }').then(
    (d) => d.projectToken
  );
  if (!tokenData) {
    console.error('Invalid or missing project token.');
    process.exit(1);
  }

  const { projectId, environmentId } = tokenData;
  const proj = await gql(
    token,
    'query($id: String!) { project(id: $id) { id name services { edges { node { id name } } } } }',
    { id: projectId }
  ).then((d) => d.project);

  if (!proj) {
    console.error('Project not found.', projectId);
    process.exit(1);
  }

  const summary = {
    project: { id: proj.id, name: proj.name },
    environmentId,
    services: [],
  };

  for (const edge of proj.services?.edges ?? []) {
    const svc = edge.node;
    const inst = await gql(
      token,
      `query($sid: String!, $eid: String!) {
        serviceInstance(serviceId: $sid, environmentId: $eid) {
          serviceName
          domains { serviceDomains { domain } customDomains { domain } }
          latestDeployment { id status createdAt meta { commitMessage commitHash } }
        }
      }`,
      { sid: svc.id, eid: environmentId }
    ).then((d) => d.serviceInstance);

    const row = {
      serviceId: svc.id,
      name: svc.name,
      latestDeployment: inst?.latestDeployment ?? null,
      domains: [
        ...(inst?.domains?.serviceDomains?.map((d) => d.domain) ?? []),
        ...(inst?.domains?.customDomains?.map((d) => d.domain) ?? []),
      ].filter(Boolean),
      health: null,
    };

    if (row.domains.length > 0) {
      const base = row.domains[0].startsWith('http') ? row.domains[0] : `https://${row.domains[0]}`;
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

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
