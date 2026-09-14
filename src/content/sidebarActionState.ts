export type CopyStatus = "idle" | "copying" | "copied" | "failed";

export async function runCopyAction(
  copy: () => Promise<void>,
  setStatus: (status: CopyStatus) => void,
): Promise<void> {
  setStatus("copying");
  try {
    await copy();
    setStatus("copied");
  } catch (error) {
    setStatus("failed");
    throw error;
  }
}

export type DeleteState = "idle" | "confirming" | "deleting";
export type DeleteEvent = "request" | "cancel" | "confirm" | "fail";

export function nextDeleteState(
  state: DeleteState,
  event: DeleteEvent,
): DeleteState {
  if (state === "idle" && event === "request") {
    return "confirming";
  }
  if (state === "confirming" && event === "cancel") {
    return "idle";
  }
  if (state === "confirming" && event === "confirm") {
    return "deleting";
  }
  if (state === "deleting" && event === "fail") {
    return "confirming";
  }
  return state;
}
