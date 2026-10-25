/**
 * Privacy policy, terms, support and account-deletion text, shown on the
 * website (/privacy, /terms, /support, /delete-account) and in the app.
 *
 * Keep this in step with what the app really does. Today: no account, no
 * analytics, no ads; the collection stays on the phone. The only things that
 * leave it are the optional features listed under "Optional online features"
 * (brand list, suggest a brand, photo identify, coordinated spins). When Premium
 * (sign-in, cloud sync, photo checks with Google Cloud Vision, subscriptions)
 * ships, update the privacy policy BEFORE that build reaches testers.
 */
import { SUPPORT_EMAIL } from '@/lib/env';

export type Section = { title: string; body: string[] };

export const LEGAL_UPDATED = 'October 25, 2026';

export const PRIVACY_INTRO =
  'EDC Roulette picks a random everyday-carry combination from your own gear collection. This page explains what the app stores, where, and the choices you have.';

export const PRIVACY: Section[] = [
  {
    title: 'What the app stores, and where',
    body: [
      'Your collection (names, brands, models, categories, materials, finishes, colors, weights, notes and photos), your wheels and locks, your settings and your recent spins are stored only on your phone, in the app’s own storage. Your collection is never uploaded.',
      'Photos you add are copied into the app, resized, and kept on your phone. EDC Roulette asks for camera or photo library access only when you choose to add a photo, and only uses the photos you pick.',
    ],
  },
  {
    title: 'Optional online features',
    body: [
      'A few features talk to our server (hosted on Supabase). None of them needs an account, and the app works without them.',
      'Brand list: the app downloads the list of approved brands now and then, so a brand you type can be matched. Nothing about you or your collection is sent with that request.',
      'Suggest a brand: if you tap “Suggest it” for a brand that isn’t on the list, the brand name, the item’s category and a random device number are sent for review. The device number is not tied to you; it is used only to limit how many suggestions one phone can send.',
      'Identify from a photo (asks first, can be turned off in Settings): the photo you chose, along with any short notes you wrote under “Teach the photo check” in Settings, is sent to our server, which passes it to an AI service (Anthropic’s Claude) to work out what the item is, and sends back the type, brand, model, material, finish and color. We do not store the photo or the answer. We keep only a daily count per random device number and per network address (both scrambled so they can’t be read back) to stop abuse.',
      'Coordinated spins (asks first, can be turned off in Settings): when you choose the “Coordinated” spin style, the text details of the pieces in your wheels (names, brands, models, materials, finishes and colors, no photos) are sent the same way so the AI can pick pieces that go well together. Nothing is stored.',
      'Update check: the store versions of the app ask GitHub (api.github.com) for a short note holding the newest build number, so the app can tell you when an update is available. Nothing about you or your collection is sent with that request, but, as with any request, GitHub can see the phone’s network address. Development builds never do this.',
      'The AI service handles what it receives under its own terms and privacy policy. If you decline or turn AI help off, no photos or item details leave your phone, and spins are random.',
    ],
  },
  {
    title: 'What we don’t do',
    body: [
      'The current version has no account and no sign-in. It has no advertising, no analytics or tracking, and we do not sell or share data.',
      'Share kit makes a picture on your phone and hands it to the share sheet. It is sent only where you choose, by you; we never receive it.',
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
      'You can edit or delete any item at any time. Settings → “Erase everything on this phone” removes your whole collection, its photos, your wheels and spin history. Settings → “Allow AI help” turns the photo and coordinated-spin features off at any time. Deleting the app also removes everything it stored.',
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
      'You own the information and photos you add. Only add photos you have the right to use. They stay on your phone, except a photo you choose to identify, which is sent for that request as described in the privacy policy.',
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
      'Each wheel picks from one category, like Knife or Flashlight. Spin, and each unlocked wheel lands on a piece from your collection in that category: a random one, or a set that goes well together if you choose the Coordinated spin style in Settings. Tap a wheel to lock its current piece for the next spins, or double-tap it to choose a piece from a list. Starring a piece as a favorite lists it first and makes it somewhat more likely to be picked; stars are kept on your phone like the rest of your collection. Press and hold a wheel to change what it spins, reorder wheels, remove them or add one (up to six).',
    ],
  },
  {
    title: 'How do I add gear quickly?',
    body: [
      'Open Collection, tap +, and take or choose a photo. If you allow AI help, EDC Roulette suggests the type, brand, model, material, finish and color for you to check. You can also tap a popular brand or start typing: a misspelled brand is matched to the right one, and if yours isn’t on the list you can suggest it. Settings → “Load sample gear” fills the collection with examples to try.',
    ],
  },
  {
    title: 'How many items and slots can I have?',
    body: ['The free version holds up to 20 of your own items (sample gear doesn’t count) and up to 6 wheels. Premium, when it arrives, lifts the item limit.'],
  },
  {
    title: 'I got a new phone. Can I move my collection?',
    body: [
      'Not yet: the free version keeps everything on the phone it was added on. Cloud backup and syncing are planned for Premium.',
    ],
  },
  {
    title: 'Want to try the app?',
    body: [`EDC Roulette is in testing. Email ${SUPPORT_EMAIL} with your name and the email address on your Apple ID (iPhone and iPad) or your Google account (Android), and you’ll be sent an invite.`],
  },
  {
    title: 'Where is the full guide?',
    body: ['The user manual covers every screen and setting: edcroulette.app/manual, or Settings → Help and about in the app.'],
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
