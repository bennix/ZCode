export interface StudioDesignBrief {
  goal: string;
  audience: string;
  platform: string;
  palette: string;
  typography: string;
  layout: string;
  mood: string;
  density: string;
  constraints: string;
}
export interface StudioDesignVersion {
  html: string;
  brief: StudioDesignBrief;
}
export interface StudioDesignProject {
  id: string;
  title: string;
  updatedAt: number;
  brief: StudioDesignBrief;
  html: string;
  asset: string;
  versions: StudioDesignVersion[];
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("zencode-studio-designs", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects", { keyPath: "id" });
      request.result.createObjectStore("deleted");
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
  });
  return database;
}
export async function listStudioDesigns(): Promise<StudioDesignProject[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () =>
      resolve((request.result as StudioDesignProject[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
export async function saveStudioDesign(project: StudioDesignProject): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "deleted"], "readwrite");
    let deleted = false;
    const check = tx.objectStore("deleted").get(project.id);
    check.onsuccess = () => {
      // 删除与写入在同一事务串行，禁止旧窗口的保存复活项目。
      deleted = Boolean(check.result);
      if (!deleted) tx.objectStore("projects").put(project);
    };
    tx.oncomplete = () => (deleted ? reject(new Error("Design project was deleted")) : resolve());
    tx.onabort = () => reject(tx.error ?? new Error("Design save aborted"));
  });
}
export async function deleteStudioDesign(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "deleted"], "readwrite");
    tx.objectStore("projects").delete(id);
    tx.objectStore("deleted").put(true, id);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Design deletion aborted"));
  });
}
