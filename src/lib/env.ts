// EXPO_PUBLIC_* values are inlined at build time from .env (dev) or
// config/prod.env (production builds). They must be written as literal
// process.env.EXPO_PUBLIC_X expressions for the inlining to work.

export const APP_ENV: 'dev' | 'prod' = process.env.EXPO_PUBLIC_APP_ENV === 'prod' ? 'prod' : 'dev';

/** True in the development app and on dev.edcroulette.app. */
export const IS_DEV_BUILD = APP_ENV !== 'prod';

export const SITE_URL = IS_DEV_BUILD ? 'https://dev.edcroulette.app' : 'https://edcroulette.app';
export const SUPPORT_EMAIL = 'support@edcroulette.app';
