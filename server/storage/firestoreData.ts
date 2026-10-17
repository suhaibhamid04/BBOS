/** Omit optional object properties without coercing money, dates or SDK values.
 * Undefined array members remain invalid; silently shifting their positions
 * would corrupt ordered business data. Firestore still validates them.
 */
export function firestoreData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => firestoreData(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => [key, firestoreData(nested)]),
  ) as T;
}
