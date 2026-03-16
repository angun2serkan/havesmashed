export type TagDefinition = { id: number; name: string; category: string };

export type Gender = "male" | "female" | "other";

export const AGE_RANGES = ["18-22", "23-27", "28-32", "33-37", "38-42", "43+"] as const;

export const HEIGHT_RANGES = ["-150", "150-160", "160-165", "165-170", "170-175", "175-180", "180-185", "185-190", "190-195", "195-200", "200+"] as const;

// Tags will be loaded from API
let tagsCache: TagDefinition[] = [];
let tagsByCategory: Record<string, TagDefinition[]> = {};
let tagsById: Record<number, TagDefinition> = {};

export async function loadTags(): Promise<void> {
  if (tagsCache.length > 0) return; // already loaded
  const { api } = await import("@/services/api");
  const tags = await api.getTags();
  tagsCache = tags.map((t) => ({ id: t.id, name: t.name, category: t.category }));
  tagsByCategory = {};
  tagsById = {};
  for (const tag of tagsCache) {
    if (!tagsByCategory[tag.category]) tagsByCategory[tag.category] = [];
    tagsByCategory[tag.category]!.push(tag);
    tagsById[tag.id] = tag;
  }
}

export function getTagsByCategory(category: string): TagDefinition[] {
  return tagsByCategory[category] ?? [];
}

export function getTagById(id: number): TagDefinition | undefined {
  return tagsById[id];
}

export function getAllTagsById(): Record<number, TagDefinition> {
  return tagsById;
}

export function addTagToCache(tag: TagDefinition): void {
  tagsCache.push(tag);
  if (!tagsByCategory[tag.category]) tagsByCategory[tag.category] = [];
  tagsByCategory[tag.category]!.push(tag);
  tagsById[tag.id] = tag;
}
