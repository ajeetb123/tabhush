// The only bridge between the pages and the app: one call() and a change signal (contextIsolation).
// The classifier window also gets the embed request channel.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tabhush", {
  call: (msg: unknown) => ipcRenderer.invoke("call", msg),
  onChange: (cb: () => void) => {
    ipcRenderer.on("changed", () => cb());
  },
  onEmbed: (handler: (texts: string[]) => Promise<number[][]>) => {
    ipcRenderer.on("embed", (_e, req: { id: number; texts: string[] }) => {
      handler(req.texts).then(
        (vectors) => ipcRenderer.send("embed:reply", { id: req.id, ok: true, vectors }),
        (err: unknown) => ipcRenderer.send("embed:reply", { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    });
  },
});
