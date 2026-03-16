function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const projectId = req('RAILWAY_PROJECT_ID');
  const environmentId = req('RAILWAY_ENVIRONMENT_ID');
  const serviceId = req('RAILWAY_SERVICE_ID');

  // Railway expects EnvironmentVariables scalar (map/object), not an array.
  const variables = {
    DATABASE_URL: req('DATABASE_URL'),
    NODE_ENV: process.env.NODE_ENV || 'production',
    PORT: process.env.PORT || '3001',
  };

  const query =
    'mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }';
  const input = { projectId, environmentId, serviceId, variables };

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { input } }),
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

