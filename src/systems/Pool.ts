/**
 * Hard rule 2: object pooling is mandatory and nothing is allocated inside the
 * update loop. Every member is built once up front by the owning system; obtain
 * and release only move references between two arrays.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly activeItems: T[] = [];

  constructor(size: number, factory: (index: number) => T) {
    for (let i = 0; i < size; i += 1) {
      this.free.push(factory(i));
    }
  }

  /** Null when the pool is exhausted: callers skip the spawn rather than allocate. */
  obtain(): T | null {
    const item = this.free.pop();
    if (item === undefined) return null;
    this.activeItems.push(item);
    return item;
  }

  release(item: T): void {
    const index = this.activeItems.indexOf(item);
    if (index < 0) return;
    const last = this.activeItems.length - 1;
    this.activeItems[index] = this.activeItems[last];
    this.activeItems.pop();
    this.free.push(item);
  }

  releaseAll(): void {
    for (let i = this.activeItems.length - 1; i >= 0; i -= 1) {
      this.free.push(this.activeItems[i]);
      this.activeItems.pop();
    }
  }

  /**
   * Live members. Iterate backwards when releasing during the walk, since
   * release swaps the last element into the freed slot.
   */
  get active(): readonly T[] {
    return this.activeItems;
  }

  get activeCount(): number {
    return this.activeItems.length;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
