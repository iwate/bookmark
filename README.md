# bookmark

Simple single-user bookmark service running on Cloudflare Workers + D1.

## Required configuration

This app requires both of the following at runtime:

- D1 binding named `DB`
- Worker secret named `WRITE_SECRET`

If either is missing, the app returns `500 server misconfigured`.

## Local setup

1. Install dependencies.

```sh
npm install
```

2. Ensure D1 binding is configured in `wrangler.toml` as `[[d1_databases]]` with `binding = "DB"`.

3. Set a local development secret in `.dev.vars` (do not commit this file):

```dotenv
WRITE_SECRET=replace-with-a-long-random-secret
```

4. Run local development server:

```sh
npm run dev
```

## Production setup

Set the write secret in Cloudflare before deployment:

```sh
wrangler secret put WRITE_SECRET
```

Apply migrations as needed for the configured D1 database.

## Tests

```sh
npm test
```
