export class PriorityQueue<T> {
  private heap: T[] = [];

  constructor(private readonly isHigherPriority: (left: T, right: T) => boolean) {}

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | null {
    if (this.heap.length === 0) {
      return null;
    }

    const top = this.heap[0];
    const last = this.heap.pop();
    if (last && this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return top;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.isHigherPriority(this.heap[current], this.heap[parent])) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    const { length } = this.heap;

    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;

      let best = current;

      if (left < length && this.isHigherPriority(this.heap[left], this.heap[best])) {
        best = left;
      }

      if (right < length && this.isHigherPriority(this.heap[right], this.heap[best])) {
        best = right;
      }

      if (best === current) {
        break;
      }

      this.swap(current, best);
      current = best;
    }
  }

  private swap(a: number, b: number): void {
    const temp = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = temp;
  }
}
