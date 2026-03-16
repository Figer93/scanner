function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const query = 'query { __type(name: \"Query\") { fields { name } } }';
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  const names = json.data.__type.fields.map((f) => f.name).filter((n) => /serviceInstance|domain|deployment|project/i.test(n));
  console.log(names.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

