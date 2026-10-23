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

## Brands, photo identify and coordinated spins (migration 0002)

- `edc.brands` is the brand catalog (130 seeded from `src/content/brands.json`). The app reads approved brands directly (RLS shows only `status = 'approved'`).
- `edc.suggest_brand()` lets anyone suggest a missing brand; it lands as `pending` and stays invisible until you set `status = 'approved'` in the Table Editor (`edc.brands`). Limits: 10 per device per day, 300 per day overall.
- `edc.match_brands()` is the forgiving search (typos, spacing, accents, aliases). The app has the same matching in `src/lib/brands.ts`; keep the two in step.
- Edge Functions `edc-identify` (photo → type, brand, model, material, finish, color) and `edc-pair` (coordinated spin) are open to anyone (no account yet) and limited per device, per network address and per day through `edc.take_identify_quota()` (service role only). They need the `ANTHROPIC_API_KEY` secret in the EDC repo's GitHub secrets (same value as Belay Buddy's); the Supabase workflow sets it on the project and deploys the functions. Neither stores photos or answers.
- Tunables (function secrets, optional): `EDC_AI_MODEL`, `EDC_AI_DEVICE_DAILY`, `EDC_AI_IP_DAILY`, `EDC_AI_GLOBAL_DAILY`, `EDC_PAIR_MODEL`, `EDC_PAIR_DEVICE_DAILY`, `EDC_PAIR_GLOBAL_DAILY`.
