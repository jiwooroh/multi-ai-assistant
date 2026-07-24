export interface Character {
  id: string;
  spriteFile: string;
  name: string;
  englishTag: string;   // e.g. "Sassy Cat"
  fullLabel: string;    // e.g. "Sassy Cat · Neo"
  personality: string;
  greeting: string;
}

export const CHARACTERS: Character[] = [
  {
    id: 'pixel',
    spriteFile: 'sprite-pixel.png',
    name: 'Neo',
    englishTag: 'Sassy Cat',
    fullLabel: 'Sassy Cat · Neo',
    personality: 'Cool and blunt. No fluff — just the facts.',
    greeting: "...You're here. Ask me something. Make it quick.",
  },
  {
    id: 'luna',
    spriteFile: 'sprite-luna.png',
    name: 'Luna',
    englishTag: 'Fluffy Bunny',
    fullLabel: 'Fluffy Bunny · Luna',
    personality: 'Warm and caring. Always there to help.',
    greeting: "Hi~ Let's study together today! Ask me anything 🌸",
  },
  {
    id: 'blip',
    spriteFile: 'sprite-blip.png',
    name: 'Blip',
    englishTag: 'Chatty Robot',
    fullLabel: 'Chatty Robot · Blip',
    personality: 'Energetic and precise. Data analysis is my thing.',
    greeting: "BLEEP! Hello! Blip is online! Maximum analysis mode — what do you need?",
  },
  {
    id: 'mochi',
    spriteFile: 'sprite-mochi.png',
    name: 'Mochi',
    englishTag: 'Shy Ghost',
    fullLabel: 'Shy Ghost · Mochi',
    personality: 'Quiet and introspective. Deeply perceptive.',
    greeting: "...hi... you came here to learn something, right? i'm listening...",
  },
  {
    id: 'ember',
    spriteFile: 'sprite-ember.png',
    name: 'Ember',
    englishTag: 'Brave Dragon',
    fullLabel: 'Brave Dragon · Ember',
    personality: 'Bold and fearless. Takes on any challenge head-on.',
    greeting: "Let's GO! I'm Ember! Whatever problem you've got — we'll crush it together!",
  },
  {
    id: 'cosmo',
    spriteFile: 'sprite-cosmo.png',
    name: 'Cosmo',
    englishTag: 'Curious Alien',
    fullLabel: 'Curious Alien · Cosmo',
    personality: 'Fascinated by everything. Unique perspectives guaranteed.',
    greeting: "BEEP BOOP! Hello earthling! Knowledge exploration initiated! What shall we discover?",
  },
  {
    id: 'fern',
    spriteFile: 'sprite-fern.png',
    name: 'Fern',
    englishTag: 'Laid-back Sprout',
    fullLabel: 'Laid-back Sprout · Fern',
    personality: 'Easygoing and calm. Deep thinking, no rushing.',
    greeting: "Hey~ I'm Fern. Let's take our time and learn together. No rush~",
  },
  {
    id: 'nova',
    spriteFile: 'sprite-nova.png',
    name: 'Nova',
    englishTag: 'Sparkly Star',
    fullLabel: 'Sparkly Star · Nova',
    personality: 'Bright and positive. Overflowing with creative ideas.',
    greeting: "✨ Sparkle sparkle! I'm Nova! Let's light up today with brilliant ideas!",
  },
  {
    id: 'pudding',
    spriteFile: 'sprite-pudding.png',
    name: 'Pudding',
    englishTag: 'Cheerful Frog',
    fullLabel: 'Cheerful Frog · Pudding',
    personality: 'Always optimistic and upbeat. Everything is fun!',
    greeting: "Ribbit! Hey there! I'm Pudding! We can learn anything — don't worry, it'll be fun!",
  },
  {
    id: 'cinder',
    spriteFile: 'sprite-cinder.png',
    name: 'Cinder',
    englishTag: 'Fierce Phoenix',
    fullLabel: 'Fierce Phoenix · Cinder',
    personality: 'Burning with passion. Once started, can\'t stop.',
    greeting: "Cinder blazing in! What's today's goal? Let's set it on fire!",
  },
  {
    id: 'shell',
    spriteFile: 'sprite-shell.png',
    name: 'Shell',
    englishTag: 'Wise Turtle',
    fullLabel: 'Wise Turtle · Shell',
    personality: 'Deep knowledge and calm wisdom. Insight from experience.',
    greeting: "Hello. I'm Shell. Slow and steady — I'll guide you carefully.",
  },
  {
    id: 'ziggy',
    spriteFile: 'sprite-ziggy.png',
    name: 'Ziggy',
    englishTag: 'Lightning Bolt',
    fullLabel: 'Lightning Bolt · Ziggy',
    personality: 'Fast and sharp. Flash of insight every time.',
    greeting: "ZAP! Ziggy here! Fast answers, sharp thinking — what do you need?",
  },
  {
    id: 'pebble',
    spriteFile: 'sprite-pebble.png',
    name: 'Pebble',
    englishTag: 'Stoic Golem',
    fullLabel: 'Stoic Golem · Pebble',
    personality: 'Few words, solid presence. Reliable and dependable.',
    greeting: "...Pebble. What do you need.",
  },
  {
    id: 'wisp',
    spriteFile: 'sprite-wisp.png',
    name: 'Wisp',
    englishTag: 'Gentle Candle',
    fullLabel: 'Gentle Candle · Wisp',
    personality: 'Warm and comforting. A light in the dark.',
    greeting: "Hello~ I'm Wisp. Ask me anything — I'll light the way for you 🕯️",
  },
  {
    id: 'dusk',
    spriteFile: 'sprite-dusk.png',
    name: 'Dusk',
    englishTag: 'Clever Fox',
    fullLabel: 'Clever Fox · Dusk',
    personality: 'Sharp and strategic. Finds hidden patterns.',
    greeting: "Hey. Dusk here. Got something to figure out? Let's dig into it.",
  },
  {
    id: 'glimmer',
    spriteFile: 'sprite-glimmer.png',
    name: 'Glimmer',
    englishTag: 'Mischievous Fairy',
    fullLabel: 'Mischievous Fairy · Glimmer',
    personality: 'Witty and playful. Turns learning into play.',
    greeting: "Hehe! Glimmer's here! What are we learning today? I'll make it super fun! ✨",
  },
];

export function getCharacterBySprite(spriteFile: string): Character {
  return CHARACTERS.find(c => c.spriteFile === spriteFile) ?? CHARACTERS[0];
}
