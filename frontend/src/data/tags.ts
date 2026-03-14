export interface TagDefinition {
  id: number;
  name: string;
}

export interface TagCategory {
  key: string;
  label: string;
  tags: TagDefinition[];
}

export const MEETING_TAGS: TagDefinition[] = [
  { id: 1, name: "Dating App" },
  { id: 2, name: "Bar/Club" },
  { id: 3, name: "Through Friends" },
  { id: 4, name: "Work/School" },
  { id: 5, name: "Social Media" },
  { id: 6, name: "Public Place" },
  { id: 7, name: "Event/Party" },
  { id: 8, name: "Gym/Sports" },
  { id: 9, name: "Online Other" },
  { id: 10, name: "Blind Date" },
];

export const VENUE_TAGS: TagDefinition[] = [
  { id: 11, name: "Restaurant" },
  { id: 12, name: "Cafe" },
  { id: 13, name: "Bar" },
  { id: 14, name: "Club/Nightclub" },
  { id: 15, name: "Park" },
  { id: 16, name: "Beach" },
  { id: 17, name: "Cinema" },
  { id: 18, name: "Museum/Gallery" },
  { id: 19, name: "Shopping Mall" },
  { id: 20, name: "Home" },
  { id: 21, name: "Hotel" },
  { id: 22, name: "Rooftop" },
  { id: 23, name: "Concert/Event" },
  { id: 24, name: "Spa/Wellness" },
  { id: 25, name: "Amusement Park" },
];

export const ACTIVITY_TAGS: TagDefinition[] = [
  { id: 26, name: "Dinner" },
  { id: 27, name: "Drinks" },
  { id: 28, name: "Coffee" },
  { id: 29, name: "Movie" },
  { id: 30, name: "Walk/Stroll" },
  { id: 31, name: "Dancing" },
  { id: 32, name: "Sex" },
  { id: 33, name: "Cooking Together" },
  { id: 34, name: "Sports/Fitness" },
  { id: 35, name: "Shopping" },
  { id: 36, name: "Travel" },
  { id: 37, name: "Sightseeing" },
  { id: 38, name: "Concert/Show" },
  { id: 39, name: "Gaming" },
  { id: 40, name: "Picnic" },
  { id: 41, name: "Swimming" },
  { id: 42, name: "Hiking/Trekking" },
  { id: 43, name: "Karaoke" },
  { id: 44, name: "Board Games" },
  { id: 45, name: "Hookah/Shisha" },
];

export const PHYSICAL_FEMALE_TAGS: TagDefinition[] = [
  { id: 46, name: "Blonde" },
  { id: 47, name: "Brunette" },
  { id: 48, name: "Redhead" },
  { id: 49, name: "Black Hair" },
  { id: 50, name: "Colored Hair" },
  { id: 51, name: "Short" },
  { id: 52, name: "Average Height" },
  { id: 53, name: "Tall" },
  { id: 54, name: "Slim" },
  { id: 55, name: "Fit/Athletic" },
  { id: 56, name: "Curvy" },
  { id: 57, name: "Plus Size" },
  { id: 58, name: "Tattoos" },
  { id: 59, name: "Piercings" },
  { id: 60, name: "Glasses" },
  { id: 61, name: "Hijab" },
];

export const PHYSICAL_MALE_TAGS: TagDefinition[] = [
  { id: 62, name: "Blonde" },
  { id: 63, name: "Brunette" },
  { id: 64, name: "Redhead" },
  { id: 65, name: "Black Hair" },
  { id: 66, name: "Bald" },
  { id: 67, name: "Short" },
  { id: 68, name: "Average Height" },
  { id: 69, name: "Tall" },
  { id: 70, name: "Slim" },
  { id: 71, name: "Athletic" },
  { id: 72, name: "Muscular" },
  { id: 73, name: "Dad Bod" },
  { id: 74, name: "Plus Size" },
  { id: 75, name: "Beard" },
  { id: 76, name: "Mustache" },
  { id: 77, name: "Clean Shaven" },
  { id: 78, name: "Stubble" },
  { id: 79, name: "Tattoos" },
  { id: 80, name: "Piercings" },
  { id: 81, name: "Glasses" },
];

/** All tags in a flat map for lookups by id */
export const ALL_TAGS_BY_ID: Record<number, TagDefinition> = Object.fromEntries(
  [
    ...MEETING_TAGS,
    ...VENUE_TAGS,
    ...ACTIVITY_TAGS,
    ...PHYSICAL_FEMALE_TAGS,
    ...PHYSICAL_MALE_TAGS,
  ].map((t) => [t.id, t]),
);

export const AGE_RANGES = [
  "18-22",
  "23-27",
  "28-32",
  "33-37",
  "38-42",
  "43-47",
  "48+",
] as const;

export type Gender = "male" | "female" | "other";
