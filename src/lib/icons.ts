import {
  Activity, Bike, BookOpen, Brain, Code, Coffee, Droplet, Dumbbell, Flame, Footprints, Guitar,
  GraduationCap, Heart, Languages, Laptop, Leaf, Moon, Music, Network, Pencil, Smile, Sun,
  Target, Timer, type LucideIcon,
} from 'lucide-react';

/**
 * A curated set rather than the full lucide catalogue, which would ship every
 * icon in the bundle. Keys are what's stored on Metric.icon.
 */
export const ICONS: Record<string, LucideIcon> = {
  GraduationCap, BookOpen, Network, Dumbbell, Flame, Brain, Code, Laptop, Pencil, Languages,
  Music, Guitar, Activity, Bike, Footprints, Heart, Droplet, Coffee, Moon, Sun, Leaf, Smile,
  Target, Timer,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Target;
}
