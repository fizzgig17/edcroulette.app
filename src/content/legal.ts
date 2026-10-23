/**
 * Privacy policy, terms, support and account-deletion text, shown on the
 * website (/privacy, /terms, /support, /delete-account) and in the app.
 *
 * Keep this in step with what the app really does. Today: no account, no
 * server, no analytics, no ads; everything stays on the phone. When Premium
 * (sign-in, cloud sync, photo checks with Google Cloud Vision, subscriptions)
 * ships, update the privacy policy BEFORE that build reaches testers.
 */
import { SUPPORT_EMAIL } from '@/lib/env';

export type Section = { title: string; body: string[] };

export const LEGAL_UPDATED = 'October 23, 2026';

export const PRIVACY_INTRO =
  'EDC Roulette picks a random everyday-carry combination from your own gear collection. This page explains what the app stores, where, and the choices you have.';

export const PRIVACY: Section[] = [
  {
    title: 'What the app stores, and where',
    body: [
      'Your collection (names, categories, materials, finishes, colors, weights, notes and photos), your slots and locks, and your recent spins are stored only on your phone, in the app’s own storage. They are not sent to us or anyone else.',
      'Photos you add are copied into the app, resized, and kept on your phone. EDC Roulette asks for camera or photo library access only when you choose to add a photo, and only uses the photos you pick.',
    ],
  },
  {
    title: 'What we don’t do',
    body: [
      'The current version has no account and no sign-in, and does not send your collection anywhere. It has no advertising, no analytics or tracking, and we do not sell or share data.',
    ],
  },
  {
    title: 'App stores',
    body: [
      'Apple (App Store and TestFlight) and Google (Google Play) distribute the app and may collect information under their own privacy policies, such as download and crash reports you allow them to share with developers.',
    ],
  },
  {
    title: 'Premium (not available yet)',
    body: [
      'A future Premium subscription will add optional sign-in (Apple, Google or Facebook), cloud backup and syncing, EDC Friends, and a web dashboard. Those features would store some data on our servers. This policy will be updated to explain exactly what before Premium is offered, and nothing changes for you unless you choose to sign up.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can edit or delete any item at any time. Settings → “Erase everything on this phone” removes your whole collection, its photos, your slots and spin history. Deleting the app also removes everything it stored.',
    ],
  },
  {
    title: 'Children',
    body: ['EDC Roulette is not directed at children under 13, and we do not knowingly collect information from them.'],
  },
  {
    title: 'Changes and contact',
    body: [
      'If this policy changes, the new version will be posted here with a new date.',
      `Questions: ${SUPPORT_EMAIL}`,
    ],
  },
];

export const TERMS_INTRO = 'These terms apply when you use the EDC Roulette app or this website.';

export const TERMS: Section[] = [
  {
    title: 'Using the app',
    body: [
      'EDC Roulette is a randomizer for your own gear. The picks are suggestions for fun; you decide what you carry. Always follow the laws where you are about what you may carry, including knife laws.',
      'It is not gambling: there is no betting, no money or prizes, and nothing to win.',
    ],
  },
  {
    title: 'Your content',
    body: [
      'You own the information and photos you add. Only add photos you have the right to use. In the current version they stay on your phone.',
    ],
  },
  {
    title: 'No warranty',
    body: [
      'The app is provided “as is”, without warranties of any kind. Keep your own records of anything important; data stored on a phone can be lost if the app or the phone is deleted or reset.',
      'To the extent the law allows, we are not liable for any indirect or consequential loss arising from using the app.',
    ],
  },
  {
    title: 'Subscriptions',
    body: [
      'Premium is not available yet. When it is, it will be sold through the App Store or Google Play under their terms, and these terms will be updated with the details.',
    ],
  },
  {
    title: 'Changes and contact',
    body: [`We may update these terms; the date above shows the latest version. Questions: ${SUPPORT_EMAIL}`],
  },
];

export const SUPPORT: Section[] = [
  {
    title: 'How does the spin work?',
    body: [
      'Each slot is one reel and picks from one category, like Knife or Flashlight. Spin, and each unlocked reel lands on a random piece from your collection in that category. Tap Lock under a reel to keep its current piece for the next spins.',
    ],
  },
  {
    title: 'How many items and slots can I have?',
    body: ['The free version holds up to 20 items and 4 slots. Premium, when it arrives, removes both limits.'],
  },
  {
    title: 'I got a new phone. Can I move my collection?',
    body: [
      'Not yet: the free version keeps everything on the phone it was added on. Cloud backup and syncing are planned for Premium.',
    ],
  },
  {
    title: 'Something isn’t working',
    body: [`Email ${SUPPORT_EMAIL} with your phone model and what happened. Screenshots help.`],
  },
];

export const DELETE_ACCOUNT: Section[] = [
  {
    title: 'The free version has no account',
    body: [
      'Everything is stored on your phone, so there is nothing on our servers to delete. To remove your data: open EDC Roulette → Settings → “Erase everything on this phone”, or delete the app.',
    ],
  },
  {
    title: 'Premium accounts',
    body: [
      'When Premium is available, you will be able to delete your account and all of its data from Settings in the app. You can also ask us to do it: email ' +
        SUPPORT_EMAIL +
        ' from the email address on the account, with the subject “Delete my account”. We delete the account, your cloud collection and photos within 30 days and confirm by email.',
    ],
  },
];
