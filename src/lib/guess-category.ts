/**
 * Guesses an item's category from what the phone's own image labeler sees in the photo ("Knife", "Pen", "Wristwatch"...).
 * It runs on the phone, so nothing is sent anywhere. Only the kind of item is guessed (never brand or model).
 */
export type PhotoLabel = { label: string; confidence: number };

/** Words the labelers use for each built-in category. Custom categories match their own name. */
const WORDS: Record<string, string[]> = {
  knife: ['knife', 'knives', 'blade', 'dagger', 'cutlery', 'machete', 'cleaver', 'razor', 'sword', 'kitchen knife', 'pocketknife'],
  flashlight: ['flashlight', 'torch', 'lantern', 'lamp', 'light', 'headlamp', 'flash light'],
  pen: ['pen', 'pencil', 'marker', 'writing instrument', 'stylus', 'ballpoint', 'fountain pen', 'office supplies'],
  'multi-tool': ['multitool', 'multi-tool', 'pliers', 'screwdriver', 'wrench', 'tool', 'hand tool', 'scissors', 'swiss army'],
  watch: ['watch', 'wristwatch', 'clock', 'timepiece'],
  wallet: ['wallet', 'purse', 'card holder', 'cardholder', 'coin purse'],
  keychain: ['key', 'keys', 'keychain', 'key ring', 'keyring', 'carabiner'],
  'pry bar': ['crowbar', 'pry bar', 'prybar', 'lever'],
  sunglasses: ['sunglasses', 'glasses', 'eyewear', 'goggles', 'spectacles'],
  'fidget spinner': ['fidget', 'spinner', 'fidget spinner', 'toy'],
  bag: ['bag', 'backpack', 'handbag', 'pouch', 'satchel', 'luggage', 'messenger bag'],
  beads: ['bead', 'beads', 'jewellery', 'jewelry', 'necklace', 'bracelet'],
  coin: ['coin', 'coins', 'currency', 'money', 'medal'],
};

/** Words that only weakly suggest a category (a flashlight looks like a tube or a battery to a general labeler). */
const WEAK: Record<string, string[]> = {
  flashlight: ['cylinder', 'tube', 'pipe', 'battery', 'bottle'],
};

const clean = (t: string) => t.toLowerCase().replace(/[_-]+/g, ' ').trim();

const hit = (label: string, word: string) => {
  const l = clean(label);
  word = clean(word);
  if (word.includes(' ')) return l.includes(word);
  const toks = l.split(/[^a-z]+/);
  return toks.includes(word) || toks.includes(`${word}s`);
};

/** The category (one of `categories`) the labels point to, or null when nothing is clear enough. */
export function categoryFromLabels(labels: PhotoLabel[], categories: string[], minScore = 0.1): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const c of categories) {
    if (c === 'Other') continue;
    const key = c.toLowerCase();
    const words = [...new Set([key, ...(WORDS[key] ?? [])])];
    const weak = WEAK[key] ?? [];
    let score = 0;
    for (const l of labels) {
      if (words.some((w) => hit(l.label, w))) score = Math.max(score, l.confidence) + (score > 0 ? 0.05 : 0);
      else if (weak.some((w) => hit(l.label, w))) score = Math.max(score, l.confidence * 0.7);
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= minScore ? best : null;
}
