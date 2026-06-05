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

With `WRITE_SECRET` declared as a required secret in `wrangler.toml`, both `WRITE_SECRET=test npm run dev` and `.dev.vars` work for local testing.

4. Run local development server:

```sh
npm run dev
```

This applies the local D1 migrations automatically before starting Wrangler, so a fresh database no longer needs manual setup.

## Production setup

Set the write secret in Cloudflare before deployment:

```sh
wrangler secret put WRITE_SECRET
```

Apply migrations as needed for the configured D1 database.

## Tests

```sh
npm test
npm run test:e2e
```

`npm test` remains the default automated suite. `npm run test:e2e` verifies MVP critical paths (`GET /`, `POST /bookmarks` with valid `WRITE_SECRET`, `GET /rss.xml`) against a local Wrangler runtime.

## Routes

- `GET /`: render bookmark list and forms
- `GET /rss.xml`: render RSS feed from current bookmarks
- `POST /bookmarks`: create a bookmark (`url`, `title`, `thumbnailUrl`, `comment`, `secret`)
- `POST /bookmarks/:id/update`: update an existing bookmark (`url`, `title`, `thumbnailUrl`, `comment`, `secret`)
- `POST /bookmarks/:id/delete`: delete an existing bookmark (`secret`)

All write routes require a valid `WRITE_SECRET` and return `403` when authentication fails.
