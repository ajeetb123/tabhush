// INV-14: an extension update arriving mid-session waits until the session ends.
// Chrome's docs say a pending update installs when the background context unloads, which MV3
// service workers do routinely, so real-browser behavior is still to verify (OPEN Q-47).

export async function onUpdateAvailable(deps: {
  sessionInProgress: () => Promise<boolean>;
  markPending: () => Promise<void>;
  reload: () => void;
}): Promise<"deferred" | "applied"> {
  if (await deps.sessionInProgress()) {
    await deps.markPending();
    return "deferred";
  }
  deps.reload();
  return "applied";
}
