function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const deploymentId = req('RAILWAY_DEPLOYMENT_ID');

  const query = `query($id: String!) {
    deployment(id: $id) {
      id
      status
      url
      staticUrl
      createdAt
      statusUpdatedAt
      suggestAddServiceDomain
      diagnosis
      meta
    }
  }`;

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { id: deploymentId } }),
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

