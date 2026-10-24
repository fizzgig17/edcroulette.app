import { IS_DEV_BUILD } from '@/lib/env';

/** Free tier ceilings. Premium (phase 3) lifts both; the wheel limit may move behind it later. */
export const FREE_MAX_ITEMS = 20;
/** Wheels (slots) anyone can have. */
export const FREE_MAX_SLOTS = 6;
export const MIN_SLOTS = 1;
/** How many wheels the portrait Spin screen shows; the rest still pick, without turning. */
export const PORTRAIT_WHEELS = 3;

/** What the app enforces: dev builds (never the store version) are unlimited so everything can be tested. */
export const MAX_ITEMS = IS_DEV_BUILD ? 1000 : FREE_MAX_ITEMS;
