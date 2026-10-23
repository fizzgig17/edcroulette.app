# EDC Roulette's database (inside Belay Buddy's Supabase projects)

| Branch | Project |
|---|---|
| `develop` | belaybuddy-dev |
| `master` | belaybuddy-prod |

Everything EDC owns is in the **`edc` schema**, so it never collides with Belay
Buddy's `public` tables. Accounts (`auth.users`) are shared between the apps.

## Changing the schema

Add a new numbered file to `migrations/` (`0002_….sql`, `0003_….sql`) — never
edit one that has already been applied. Pushing it to `develop` applies it to
belaybuddy-dev; merging to `master` applies it to belaybuddy-prod
(`.github/workflows/supabase-edc.yml`). Each file runs once, in a transaction,
and is recorded in `edc.schema_migrations`.

Don't use `supabase db push` / `supabase migration` here: those keep one history
per database, and Belay Buddy's repo already owns it.

## Tables

| Table | What it holds | Who can write |
|---|---|---|
| `edc.profiles` | One row per EDC account: tier, premium expiry, friend code | Created by `edc.ensure_profile()`; users can change only `display_name`; tier only by the service role |
| `edc.gear_items` | Cloud copy of the collection | Premium owners (delete always allowed) |
| `edc.slots` | Reels: category and locked item | Premium owners |
| `edc.friendships` | EDC Friends requests and links | `edc.send_friend_request(code)` (premium); the recipient accepts |
| `edc.api_keys` | Hashed personal API keys | `edc.create_api_key(name)` (premium); owners can revoke |

Friends can read each other's profiles, gear and gear photos. Photos live in the
private `edc-gear` bucket under `<user id>/…`; only the service role (the photo
upload function, after the Google Cloud Vision check) writes there.

## Secrets (repo Settings → Secrets and variables → Actions)

Same values as in `belaybuddy.app`: `SUPABASE_ACCESS_TOKEN`, `DEV_PROJECT_ID`,
`DEV_DB_PASSWORD`, `PROD_PROJECT_ID`, `PROD_DB_PASSWORD`.
