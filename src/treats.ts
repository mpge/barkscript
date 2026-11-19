/**
 * `treats`: BarkScript's name for saved values. On a web page it is localStorage;
 * anywhere else it is a stash that lasts until the program ends.
 *
 *     treats.bury("bones", 3)    localStorage.setItem("bones", "3")
 *     treats.grab("bones")       3, or empty bowl if nothing is buried there
 *     treats.eat("bones")        localStorage.removeItem("bones")
 *
 * Values go in as JSON, so numbers, lists and objects come back as they were buried.
 */

/** The three tricks, and the localStorage method each one replaces. */
export const TREAT_TRICKS = { bury: 'setItem', grab: 'getItem', eat: 'removeItem' } as const;
export type TreatTrick = keyof typeof TREAT_TRICKS;

/** How many arguments each trick takes, and an example for error messages. */
export const TREAT_ARGS: Record<TreatTrick, { count: number; needs: string; example: string }> = {
  bury: { count: 2, needs: 'a name and a value', example: 'treats.bury("bones", 3)' },
  grab: { count: 1, needs: 'a name', example: 'treats.grab("bones")' },
  eat: { count: 1, needs: 'a name', example: 'treats.eat("bones")' },
};

/** The part of the Storage interface treats needs. */
export interface Shelf {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

export interface Treats {
  bury(name: unknown, value: unknown): void;
  grab(name: unknown): unknown;
  eat(name: unknown): void;
}

/** A shelf that lasts as long as the program. */
export function memoryShelf(initial: Record<string, string> = {}): Shelf {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (name) => items.get(name) ?? null,
    setItem: (name, value) => void items.set(name, value),
    removeItem: (name) => void items.delete(name),
  };
}

export function makeTreats(shelf: Shelf = memoryShelf()): Treats {
  return {
    bury(name, value) {
      shelf.setItem(String(name), JSON.stringify(value) ?? 'null');
    },
    grab(name) {
      const raw = shelf.getItem(String(name));
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        // Saved by something other than treats.bury: hand it back as text.
        return raw;
      }
    },
    eat(name) {
      shelf.removeItem(String(name));
    },
  };
}
