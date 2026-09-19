/**
 * Admission control for the thumbnail iframes of the multi-column grid.
 *
 * Every preview is a real frontend request, so only the tiles that scrolled
 * into view are loaded, at most `maxConcurrent` at a time. A cType is
 * "admitted" once its iframe may be rendered (that never reverts, the browser
 * caches the document) and "loading" until the iframe fired load or error.
 * Dependency-free so it can be unit tested with plain Node.
 */
export class PreviewLoader {
  #admitted = new Set();
  #loading = new Set();
  #queue = [];
  #maxConcurrent;
  #onAdmit;

  /**
   * @param {number} maxConcurrent
   * @param {() => void} onAdmit called whenever new cTypes were admitted (re-render)
   */
  constructor(maxConcurrent, onAdmit) {
    this.#maxConcurrent = maxConcurrent;
    this.#onAdmit = onAdmit;
  }

  /** @param {string} cType */
  isAdmitted(cType) {
    return this.#admitted.has(cType);
  }

  /**
   * Forgets queued and in-flight entries whose tiles left the grid (filter
   * change), so a vanished iframe never blocks a load slot forever.
   * @param {Iterable<string>} currentTypes the cTypes currently in the grid
   */
  sync(currentTypes) {
    const current = new Set(currentTypes);
    this.#queue = this.#queue.filter((cType) => current.has(cType) && !this.#admitted.has(cType));
    for (const cType of [...this.#loading]) {
      if (!current.has(cType)) {
        this.#loading.delete(cType);
      }
    }
  }

  /**
   * @param {string} cType
   * @param {boolean} priority front of the queue instead of the back
   * @param {boolean} pump start loading right away
   */
  enqueue(cType, priority = false, pump = true) {
    if (!cType || this.#admitted.has(cType)) {
      return;
    }
    if (this.#queue.includes(cType)) {
      if (priority) {
        this.#queue = [cType, ...this.#queue.filter((entry) => entry !== cType)];
      }
      return;
    }
    priority ? this.#queue.unshift(cType) : this.#queue.push(cType);
    if (pump) {
      this.pump();
    }
  }

  /**
   * Puts the tiles visible right now in front of everything else, in their
   * visual order, and starts loading.
   * @param {string[]} visibleTypes
   */
  prime(visibleTypes) {
    for (let i = visibleTypes.length - 1; i >= 0; i--) {
      this.enqueue(visibleTypes[i], true, false);
    }
    this.pump();
  }

  /** Fills the free load slots from the queue. */
  pump() {
    let admitted = false;
    while (this.#loading.size < this.#maxConcurrent && this.#queue.length > 0) {
      const cType = this.#queue.shift();
      if (this.#admitted.has(cType)) {
        continue;
      }
      this.#loading.add(cType);
      this.#admitted.add(cType);
      admitted = true;
    }
    if (admitted) {
      this.#onAdmit();
    }
  }

  /**
   * The iframe of a cType fired load or error: free its slot.
   * @param {string} cType
   */
  settle(cType) {
    this.#loading.delete(cType);
    this.pump();
  }

  /** Drops the queue and the in-flight set (the grid is gone); admissions stay. */
  reset() {
    this.#queue = [];
    this.#loading.clear();
  }
}
