import { IS_DEV_BUILD } from '@/lib/env';
import { FREE_MAX_ITEMS, PRO_MAX_ITEMS } from '@/lib/pro';

export { FREE_MAX_ITEMS, PRO_MAX_ITEMS };
/** Wheels (slots) anyone can have. */
export const FREE_MAX_SLOTS = 6;
export const MIN_SLOTS = 1;
/** How many wheels the portrait Spin screen shows; the rest still pick, without turning. */
export const PORTRAIT_WHEELS = 3;

/** The website's demo collection (the app itself uses Pro status: see lib/pro.ts). */
export const MAX_ITEMS = IS_DEV_BUILD ? PRO_MAX_ITEMS : FREE_MAX_ITEMS;
