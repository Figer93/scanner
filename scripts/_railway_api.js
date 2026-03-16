function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function gql(query, variables) {
  const token = requireEnv('RAILWAY_API_TOKEN');
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: variables ?? null }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  return json.data;
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'me') {
    const data = await gql('query { me { id name email workspaces { id name } } }');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'projectCreate') {
    const name = process.argv[3] || 'scanner';
    const data = await gql(
      'mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id name } }',
      { input: { name } }
    );
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'projectByName') {
    const workspaceId = process.argv[3];
    const name = process.argv[4];
    if (!workspaceId || !name) throw new Error('Usage: projectByName <workspaceId> <name>');
    const data = await gql(
      'query($workspaceId: String!) { workspace(workspaceId: $workspaceId) { projects { edges { node { id name } } } } }',
      { workspaceId }
    );
    const edges = data.workspace?.projects?.edges || [];
    const found = edges.map((e) => e.node).find((p) => p.name.toLowerCase() === name.toLowerCase());
    console.log(JSON.stringify({ found }, null, 2));
    return;
  }

  if (cmd === 'serviceCreateFromGithub') {
    const projectId = process.argv[3];
    const serviceName = process.argv[4] || 'app';
    const repo = process.argv[5]; // e.g. Figer93/scanner
    if (!projectId || !repo) {
      throw new Error('Usage: serviceCreateFromGithub <projectId> <serviceName> <owner/repo>');
    }
    const [owner, repoName] = repo.split('/');
    const data = await gql(
      'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
      {
        input: {
          projectId,
          name: serviceName,
          source: {
            repo: repoName,
            owner,
            provider: 'GITHUB',
          },
        },
      }
    );
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'projectServices') {
    const projectId = process.argv[3];
    if (!projectId) throw new Error('Usage: projectServices <projectId>');
    const data = await gql(
      'query($projectId: String!) { project(id: $projectId) { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }',
      { projectId }
    );
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  throw new Error(
    `Unknown cmd ${cmd}. Use: me | projectCreate <name> | projectByName <workspaceId> <name> | serviceCreateFromGithub <projectId> <serviceName> <owner/repo> | projectServices <projectId>`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

