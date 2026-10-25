/**
 * The user manual, shown on the website (/manual) and in the app (Settings → Help and about).
 * Keep it in step with the app: when a screen or setting changes, change it here too.
 */
import { SUPPORT_EMAIL } from '@/lib/env';
import { FREE_MAX_ITEMS, FREE_MAX_SLOTS } from '@/lib/limits';
import type { Section } from '@/content/legal';

export const MANUAL_INTRO =
  'EDC Roulette keeps a list of the things you carry and spins for today’s everyday carry. This manual covers the whole app. A short guided tour also runs the first time you open it, and you can replay it from Settings → Help and about → Show the tour again.';

export const MANUAL: Section[] = [
  {
    title: 'The basics',
    body: [
      'Add what you own to your Collection. Each wheel on the Spin screen is one category, like Knife, Flashlight or Pen. Tap Spin and every wheel lands on a piece from your collection in its category. Together the pieces are today’s carry.',
      'Everything is kept on your phone. There is no account to make, and the free version works without an internet connection.',
    ],
  },
  {
    title: 'Getting started',
    body: [
      'The first time you open the app the tour asks whether to try it with sample gear. Sample gear is about ten made-up pieces for each category so the wheels have something to land on. It doesn’t count toward your item limit and you can remove it in one tap in Settings → Your data.',
      `Then add your own pieces. The free version holds up to ${FREE_MAX_ITEMS} of your own items and up to ${FREE_MAX_SLOTS} wheels.`,
    ],
  },
  {
    title: 'The wheels and spinning',
    body: [
      'Tap Spin to turn the wheels. Each wheel stops at its own time and a little different speed. While they turn the Spin button says Stop; tap it to land every wheel on this spin’s result right away.',
      'Tap Lock under a wheel to keep the piece it shows. Locked wheels stay put through later spins, so you can lock what you’re definitely carrying and spin for the rest. Tap Lock again to release it.',
      'On a phone held upright you see the first three wheels; turn the phone sideways to see them all. Wheels that aren’t on screen still pick a piece, they just don’t turn. On an iPad, a tablet or an open foldable all the wheels are always shown, centered, with the Spin button under them.',
    ],
  },
  {
    title: 'Today’s carry',
    body: [
      'Under the wheels, Today’s carry lists the pieces from your last spin, and the app remembers it until you spin again. Tap a piece to see its details. If you haven’t spun yet it says so; if pieces from the last spin were removed from your collection it asks you to spin again.',
    ],
  },
  {
    title: 'Your collection',
    body: [
      'Open Collection and tap + to add a piece. Give it a name, category, brand, model, material, finish and color, and a photo if you like. Typing a brand matches it against a list of popular brands, including common misspellings.',
      'The collection can be shown as a list, a grid or compact rows. Search by name or brand, filter by category with the chips, and tap a piece to see or edit it.',
      'To delete a piece, swipe it left. An Undo bar appears for a few seconds. To remove several at once, press and hold a piece (or tap Select), tick the ones you want, then tap Remove.',
    ],
  },
  {
    title: 'Settings: wheels',
    body: [
      'Settings → Wheels lets you add or remove wheels, drag the grip to reorder them, and tap a wheel’s swap button to change its category. The first three wheels are the ones shown on a phone held upright.',
    ],
  },
  {
    title: 'Settings: spinning and sound',
    body: [
      'Spin style is Random (every wheel lands on a random piece from its category) or Coordinated (an AI picks pieces that go well together; see AI help below). Sound turns the soft ticks and the landing sound on or off.',
    ],
  },
  {
    title: 'Settings: look',
    body: [
      'Pick the metal for the Spin button and the trim around the wheels: Damascus, Mokume gane, Timascus, Titanium, Zirconium, Copper, Brass or Steel. On iPhone and iPad the same metal can be used for the home screen icon, or you can pick the icon separately (iOS shows a short notice each time the icon changes). Appearance follows your phone’s light or dark setting, or you can pin one.',
    ],
  },
  {
    title: 'AI help (optional)',
    body: [
      'AI help is off until you say yes, and you can turn it off again in Settings → AI help. When it is on:',
      'Identify from a photo: choose a photo when adding a piece and the app suggests the type, brand, model, material, finish and color for you to check. The photo you chose, plus any notes you wrote under “Teach the photo check”, is sent to our server, which passes it to an AI service (Anthropic’s Claude) and sends back the answer. The photo and the answer aren’t stored. “Try the photo demo” shows how it works with a built-in picture and sends nothing.',
      'Coordinated spins: the text details of the pieces in your wheels (no photos) are sent the same way so the AI can pick pieces that go well together. If it can’t connect, the spin falls back to random.',
      'Teach the photo check: short notes such as “My black pens are usually zirconium” are used as hints each time it looks at a photo.',
      'The privacy policy has the full details of what is sent.',
    ],
  },
  {
    title: 'Settings: your data',
    body: [
      'Load or remove sample gear here, and “Erase everything on this phone” deletes all items, photos, wheels and spin history. That can’t be undone, and there is nothing on our servers to delete.',
    ],
  },
  {
    title: 'iPad, tablets and foldables',
    body: [
      'On an iPad the screen shows everything at once. Upright, the wheels and Today’s carry are across the top, with Collection and Settings side by side below. Sideways, the wheels are on the left and the right side has Collection and Settings tabs. A tablet or an open foldable does the same; a folded foldable is laid out like a phone.',
    ],
  },
  {
    title: 'Updates',
    body: [
      'The store version of the app checks, when it opens, whether a newer version is out, and shows an “Update available” banner that opens TestFlight (iPhone and iPad) or Google Play (Android). Settings → Help and about → Updates lets you check by hand. Updates are installed from TestFlight or Google Play, never inside the app.',
    ],
  },
  {
    title: 'Trying the app',
    body: [
      `EDC Roulette is in testing. To try it, email ${SUPPORT_EMAIL} with your name and the email address on your Apple ID (iPhone and iPad) or your Google account (Android), and you’ll be sent an invite.`,
    ],
  },
  {
    title: 'Troubleshooting',
    body: [
      'The wheels don’t turn: check you have at least two pieces in a category (a wheel with one piece or a locked wheel lands without turning).',
      'AI help does nothing: it needs an internet connection and AI help turned on in Settings. Without it, spins are random and photos stay on your phone.',
      'A new phone: the free version keeps everything on the phone it was added on, so there is nothing to move yet. Cloud backup is planned for Premium.',
      `Something else: email ${SUPPORT_EMAIL} with your phone model and what happened. Screenshots help.`,
    ],
  },
];
