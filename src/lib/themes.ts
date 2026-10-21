import type { Metric, ThemeId } from './types';

/**
 * What a metric is about, so achievements can have themed names (10 hours
 * straight on a Study metric is Academic Menace) without the code ever
 * looking at a metric's name. Each metric stores its own theme once the user
 * picks one; until then it follows the metric's icon.
 */
export interface Theme {
  id: ThemeId;
  label: string;
  /** What belongs here, for the picker. */
  examples: string;
}

export const THEMES: Theme[] = [
  { id: 'study', label: 'Study', examples: 'Exams, courses, revision' },
  { id: 'code', label: 'Code & work', examples: 'Coding, projects, deep work' },
  { id: 'reading', label: 'Reading', examples: 'Books, articles, pages' },
  { id: 'fitness', label: 'Fitness', examples: 'Gym, running, walking, sport' },
  { id: 'mind', label: 'Mind', examples: 'Meditation, journaling, calm' },
  { id: 'creative', label: 'Creative', examples: 'Music, art, writing, making' },
  { id: 'health', label: 'Health', examples: 'Water, food, habits' },
  { id: 'sleep', label: 'Sleep', examples: 'Bedtime, hours slept' },
  { id: 'other', label: 'Other', examples: 'Anything else' },
];

export const themeById = new Map(THEMES.map((t) => [t.id, t]));

/** The default for each icon in lib/icons.ts; anything else is Other. */
const BY_ICON: Record<string, ThemeId> = {
  GraduationCap: 'study', Network: 'study', Pencil: 'study', Languages: 'study', Brain: 'study',
  Code: 'code', Laptop: 'code',
  BookOpen: 'reading',
  Dumbbell: 'fitness', Activity: 'fitness', Bike: 'fitness', Footprints: 'fitness',
  Leaf: 'mind', Smile: 'mind', Sun: 'mind',
  Music: 'creative', Guitar: 'creative',
  Heart: 'health', Droplet: 'health', Flame: 'health', Coffee: 'health',
  Moon: 'sleep',
};

export function themeFromIcon(icon: string): ThemeId {
  return BY_ICON[icon] ?? 'other';
}

export function themeOf(m: Pick<Metric, 'theme' | 'icon'>): ThemeId {
  return m.theme && themeById.has(m.theme) ? m.theme : themeFromIcon(m.icon);
}
