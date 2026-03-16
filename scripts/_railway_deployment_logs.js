function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const deploymentId = req('RAILWAY_DEPLOYMENT_ID');

  const query = `query($deploymentId: String!, $limit: Int) {
    deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
      timestamp
      severity
      message
      attributes { key value }
    }
  }`;

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { deploymentId, limit: 5000 } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  const logs = json.data.deploymentLogs;
  if (Array.isArray(logs)) {
    process.stdout.write(`logs_count=${logs.length}\n`);
    for (const l of logs) {
      process.stdout.write(`${l.timestamp} ${l.severity || ''} ${l.message}\n`);
    }
  } else {
    console.log(JSON.stringify(logs, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

