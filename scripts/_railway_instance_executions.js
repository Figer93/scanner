function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const serviceId = req('RAILWAY_SERVICE_ID');
  const environmentId = req('RAILWAY_ENVIRONMENT_ID');

  const query = `query($input: DeploymentInstanceExecutionListInput!, $first: Int) {
    deploymentInstanceExecutions(input: $input, first: $first) {
      edges {
        node {
          id
          createdAt
          status
          deploymentId
          completedAt
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
    body: JSON.stringify({
      query,
      variables: { input: { serviceId, environmentId }, first: 20 },
    }),
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

