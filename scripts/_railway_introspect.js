async function main() {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('Missing RAILWAY_API_TOKEN');

  const query = 'query { __type(name: "Mutation") { fields { name } } }';
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors }, null, 2));
  }

  const names = json.data.__type.fields
    .map((f) => f.name)
    .filter((n) => /project|service|github|repo|deploy|domain|variable|environment/i.test(n));

  process.stdout.write(names.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

