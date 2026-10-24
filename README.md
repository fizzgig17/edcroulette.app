# EDC Roulette

A slot-machine randomizer that picks today's everyday-carry combo from your
gear collection: one reel per slot (knife, flashlight, pen, multi-tool…), lock
the pieces you're definitely carrying, spin for the rest.

Built like Belay Buddy: Expo + Expo Router, `develop` → dev, `master` → prod.

## Tiers

- **Free** — no account. Up to 20 gear items and 4 slots, stored only on the phone.
- **Premium ($1.99/month)** — Sign in with Apple, Google or Facebook. Unlimited
  items and slots, cloud backup and sync, EDC Friends, web dashboard and an API key.

## Backend

EDC Roulette shares Belay Buddy's Supabase projects (fizzgig-apps-dev /
fizzgig-apps-prod). Everything it owns lives in the `edc` schema, the `edc-gear`
storage bucket and `edc-` Edge Functions. See `supabase/edc/README.md`.
