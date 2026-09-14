import { createRegistryCache } from "./cache";
import {
  probeIndexMeta,
  readIndex,
  readRepos,
  readTrending,
} from "./index-stream";
import { probeProfilesMeta, readProfiles } from "./profiles";
import { createRegistryController } from "./worker-controller";
import type { RegistryRequest } from "./protocol";

/**
 * Registry worker entry: the whole registry service (freshness probe,
 * download, parse, search index, pagination, featured computation) runs here
 * so the main thread never touches the multi-megabyte snapshot or the
 * CPU-heavy work over it. All logic lives in the controller; this file only
 * wires `self.onmessage`.
 *
 * The message type is the request union, not the wider worker-message union:
 * the worker only ever receives main-thread requests, and the narrow type
 * lets the final branch hand every query straight to `controller.handle` —
 * a new query type needs no edit here.
 */

const controller = createRegistryController(
  {
    probeMeta: probeIndexMeta,
    readIndex,
    readTrending,
    readRepos,
    readProfilesMeta: probeProfilesMeta,
    readProfiles,
    cache: createRegistryCache(),
    now: () => Date.now(),
  },
  (message) => self.postMessage(message),
);

self.onmessage = (event: MessageEvent<RegistryRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    controller.init(message.payload);
  } else if (message.type === "reload") {
    controller.reload(message.payload);
  } else if (message.type === "revalidate") {
    void controller.revalidate(message);
  } else {
    controller.handle(message);
  }
};
