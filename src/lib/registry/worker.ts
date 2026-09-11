import { createRegistryCache } from "./cache";
import { probeIndexMeta, readIndex, readTrending } from "./index-stream";
import { probeProfilesMeta, readProfiles } from "./profiles";
import { createRegistryController } from "./worker-controller";
import type { RegistryWorkerMessage } from "./protocol";

/**
 * Registry worker entry: the whole registry service (freshness probe,
 * download, parse, search index, pagination, featured computation) runs here
 * so the main thread never touches the multi-megabyte snapshot or the
 * CPU-heavy work over it. All logic lives in the controller; this file only
 * wires `self.onmessage`.
 */

const controller = createRegistryController(
  {
    probeMeta: probeIndexMeta,
    readIndex,
    readTrending,
    readProfilesMeta: probeProfilesMeta,
    readProfiles,
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
  } else if (message.type === "revalidate") {
    void controller.revalidate(message);
  } else if (
    message.type === "getPage" ||
    message.type === "getRepos" ||
    message.type === "getFeatured" ||
    message.type === "getRanking" ||
    message.type === "lookupSkills" ||
    message.type === "getDomains"
  ) {
    controller.handle(message);
  }
};
