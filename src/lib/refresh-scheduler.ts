// Story 17.7: Realtime tells the page that something changed; the page then
// reads itself again (router.refresh). Many events arrive at once (a meal plan
// change touches several tables), and this device's own saves echo back as
// events too, so the refresh is coalesced and waits while a local save is in
// flight (its optimistic state is on screen and its own answer already brings
// the server's list).

export type RefreshScheduler = {
  /** A change was heard; one refresh follows `delayMs` later, however many are heard until then. */
  notify: () => void;
  /** Refreshes at once, unless a refresh is already waiting for its turn (then that one covers it). */
  refreshNow: () => void;
  /** Drops a waiting refresh (the page is hidden or goes away). */
  cancel: () => void;
};

export type RefreshSchedulerOptions = {
  delayMs: number;
  /** True while this device saves something: the refresh waits another `delayMs`. */
  isBusy: () => boolean;
  refresh: () => void;
};

export function createRefreshScheduler({ delayMs, isBusy, refresh }: RefreshSchedulerOptions): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function arm() {
    timer = setTimeout(() => {
      timer = undefined;
      if (isBusy()) arm();
      else refresh();
    }, delayMs);
  }

  return {
    notify() {
      if (timer === undefined) arm();
    },
    refreshNow() {
      if (timer !== undefined) return;
      if (isBusy()) arm();
      else refresh();
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
