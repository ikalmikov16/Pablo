/**
 * Injectable clock abstraction.
 *
 * The runtime default calls Date.now() — this is the ONE permitted call site
 * for Date.now() inside the mockClient. Everything else receives `now` as a
 * parameter so tests stay deterministic without fake-timer setups.
 */

export type Clock = {
  readonly now: () => number;
};

export type Scheduler = {
  readonly setTimeout: (cb: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

export const defaultClock: Clock = {
  now: () => Date.now(),
};

export const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};
