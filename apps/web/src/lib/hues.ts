/** Colour is meaning, not decoration: neutral by default, forest = good/active, saffron = caution, chilli = problem. */
export interface Hue { fg: string; soft: string; solid: string; ring: string; dot: string; side: string; edge: string }
const NEUTRAL: Hue = { fg: 'text-[#4a5147]', soft: 'bg-[#efede6]', solid: 'bg-[#1b201c] text-white ring-[#1b201c]', ring: 'ring-[#dcd9ce]', dot: 'bg-[#9aa093]', side: 'text-[#c9d6cc]', edge: 'border-[#e5e3da]' };
export const HUES = {
  green:    { fg: 'text-[#17513a]', soft: 'bg-[#e8efe9]', solid: 'bg-[#17513a] text-white ring-[#17513a]', ring: 'ring-[#b5ccbe]', dot: 'bg-[#2a7a4d]', side: 'text-[#c9d6cc]', edge: 'border-[#e5e3da]' },
  saffron:  { fg: 'text-[#8f5a0d]', soft: 'bg-[#fbf0dc]', solid: 'bg-[#b8741a] text-white ring-[#b8741a]', ring: 'ring-[#e6cfa3]', dot: 'bg-[#b8741a]', side: 'text-[#c9d6cc]', edge: 'border-[#e5e3da]' },
  chilli:   { fg: 'text-[#a23e33]', soft: 'bg-[#faeae7]', solid: 'bg-[#b4483c] text-white ring-[#b4483c]', ring: 'ring-[#e8bdb6]', dot: 'bg-[#b4483c]', side: 'text-[#c9d6cc]', edge: 'border-[#e5e3da]' },
  sky: NEUTRAL, teal: NEUTRAL, plum: NEUTRAL, turmeric: NEUTRAL, gray: NEUTRAL,
} satisfies Record<string, Hue>;
export const EDGE_HEX: Record<string, string> = { green: '#e5e3da', saffron: '#e5e3da', sky: '#e5e3da', teal: '#e5e3da', plum: '#e5e3da', chilli: '#e5e3da', turmeric: '#e5e3da', gray: '#e5e3da' };
export type HueName = keyof typeof HUES;

export const TYPE_HUE: Record<string, HueName> = { DINE_IN: 'gray', TAKEAWAY: 'gray', PARCEL: 'gray' };
export const CAT_CYCLE: HueName[] = ['gray'];
export const NAV_HUE: Record<string, HueName> = {};
