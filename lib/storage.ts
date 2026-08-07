import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Metric = {
  cpu: number;
  ram: number;
  temperature: number;
  uptimeSeconds: number;
  load1: number | null;
  recordedAt: number;
};

export type StoredServer = {
  id: number;
  agentId: string;
  name: string;
  ip: string;
  location: string;
  os: string;
  createdAt: number;
  lastSeenAt: number | null;
  metrics: Metric[];
};

type Store = { nextServerId: number; servers: StoredServer[] };

const dataPath = join(/* turbopackIgnore: true */ process.env.NEXUS_DATA_DIR || "/data", "nexus.json");
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(dataPath, "utf8")) as Store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { nextServerId: 1, servers: [] };
  }
}

async function saveStore(store: Store) {
  await mkdir(dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, dataPath);
}

export async function readServers() {
  return (await loadStore()).servers;
}

export function mutateStore<T>(mutation: (store: Store) => T | Promise<T>): Promise<T> {
  const operation = writeQueue.then(async () => {
    const store = await loadStore();
    const result = await mutation(store);
    await saveStore(store);
    return result;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
