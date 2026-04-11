// Stub `next/cache` — revalidatePath / revalidateTag are no-ops under Vitest.
// Tests can observe calls by reading `__revalidated`.

export const __revalidated: string[] = [];

export function revalidatePath(path: string): void {
  __revalidated.push(path);
}

export function revalidateTag(tag: string): void {
  __revalidated.push(`tag:${tag}`);
}
