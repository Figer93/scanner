async function main() {
  const token = process.env.RAILWAY_PROJECT_ACCESS_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!token) throw new Error('Missing RAILWAY_PROJECT_ACCESS_TOKEN');
  if (!projectId) throw new Error('Missing RAILWAY_PROJECT_ID');

  const query =
    'query($projectId: String!) { project(id: $projectId) { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }';

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { projectId } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  console.log(JSON.stringify(json.data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

