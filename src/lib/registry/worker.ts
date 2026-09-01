import { createRegistryCache } from "./cache";
import { probeIndexMeta, readIndex } from "./index-stream";
import { createRegistryController } from "./worker-controller";
import type { RegistryWorkerMessage } from "./protocol";

/**
 * Registry worker entry: the whole registry service (freshness probe,
 * download, parse, search index, pagination, featured computation) runs here
 * so the main thread never touches the ~12MB index or the CPU-heavy work over
 * it. All logic lives in the controller; this file only wires `self.onmessage`.
 */

const controller = createRegistryController(
  {
    probeMeta: probeIndexMeta,
    readIndex,
    cache: createRegistryCache(),
    now: () => Date.now(),
  },
  (message) => self.postMessage(message),
);

self.onmessage = (event: MessageEvent<RegistryWorkerMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    controller.init(message.payload);
  } else if (message.type === "reload") {
    controller.reload(message.payload);
  } else if (
    message.type === "getPage" ||
    message.type === "getRepos" ||
    message.type === "getFeatured" ||
    message.type === "getRanking" ||
    message.type === "lookupSkills"
  ) {
    controller.handle(message);
  }
};
