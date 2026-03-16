function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const token = req('RAILWAY_PROJECT_ACCESS_TOKEN');
  const typeName = process.argv[2];
  const fieldName = process.argv[3];
  if (!typeName || !fieldName) throw new Error('Usage: node scripts/_railway_introspect_field_args.js <TypeName> <fieldName>');

  const query =
    'query($name: String!) { __type(name: $name) { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } }';
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': token,
    },
    body: JSON.stringify({ query, variables: { name: typeName } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }
  const f = (json.data.__type.fields || []).find((x) => x.name === fieldName);
  console.log(JSON.stringify(f, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

