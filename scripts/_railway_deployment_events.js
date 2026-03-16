function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const deploymentId = req('RAILWAY_DEPLOYMENT_ID');

  const query = `query($id: String!, $first: Int) {
    deploymentEvents(id: $id, first: $first) {
      edges {
        node {
          id
          createdAt
          step
          completedAt
          payload { error }
        }
      }
    }
  }`;

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { id: deploymentId, first: 200 } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  const edges = json.data.deploymentEvents?.edges || [];
  for (const e of edges) {
    const n = e.node;
    process.stdout.write(`${n.createdAt} ${n.step || ''} ${(n.payload?.error || '')}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

