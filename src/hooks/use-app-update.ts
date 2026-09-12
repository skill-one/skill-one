import { useSyncExternalStore } from "react";

import {
  checkForUpdate,
  closeUpdateDialog,
  dismissUpdate,
  getUpdateStatus,
  installUpdate,
  openUpdateDialog,
  subscribeUpdate,
  type UpdateStatus,
} from "../lib/update-store";

/** Reactive view of the shared self-update store + its actions. */
export function useAppUpdate(): UpdateStatus & {
  check: typeof checkForUpdate;
  dismiss: typeof dismissUpdate;
  install: typeof installUpdate;
  open: typeof openUpdateDialog;
  close: typeof closeUpdateDialog;
} {
  const status = useSyncExternalStore(subscribeUpdate, getUpdateStatus);
  return {
    ...status,
    check: checkForUpdate,
    dismiss: dismissUpdate,
    install: installUpdate,
    open: openUpdateDialog,
    close: closeUpdateDialog,
  };
}
