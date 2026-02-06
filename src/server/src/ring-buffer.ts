export class RingBuffer<T> {
  private readonly values: T[] = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error("RingBuffer capacity must be >= 1");
    }
  }

  push(value: T): void {
    this.values.push(value);
    if (this.values.length > this.capacity) {
      this.values.shift();
    }
  }

  toArray(): T[] {
    return [...this.values];
  }

  last(): T | undefined {
    return this.values[this.values.length - 1];
  }
}
