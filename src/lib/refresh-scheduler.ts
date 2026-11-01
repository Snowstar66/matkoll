// Story 17.7, polled since Story 17.12: a live page reads itself again
// (router.refresh). This device's own save already brings the server's state,
// and its optimistic state is on screen meanwhile, so a refresh due while a
// save is in flight waits until the save has answered.

export type RefreshScheduler = {
  /** Refreshes at once, or `delayMs` later and again until this device is no longer busy; a refresh already waiting covers it. */
  refreshNow: () => void;
  /** Drops a waiting refresh (the page is hidden, offline or goes away). */
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
