import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { assertSterilePreviewEnvironment } from "./guard.js";
import { PreviewSqliteRepository } from "./sqlite.js";
import { createSterilePreview } from "./preview.js";

assertSterilePreviewEnvironment();
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const webRoot = join(root, "apps/sterile-processing/dist");
if (!existsSync(join(webRoot, "index.html")))
  throw new Error("Build the sterile processing web application first.");
const repository = new PreviewSqliteRepository(
  join(root, "work/sterile-processing-preview/registry.sqlite"),
);
const preview = createSterilePreview({
  repository,
  origin: "http://127.0.0.1:9553",
  webRoot,
});
const server = createServer(preview.app);
server.on("error", () => {
  preview.dispose();
  repository.close();
  console.error(
    "The sterile preview could not start. Check whether port 9553 is already in use.",
  );
  process.exitCode = 1;
});
server.listen(9553, "127.0.0.1", () => {
  console.log("Ruby Sterile Processing — local dummy-data preview");
  console.log("Ready: http://127.0.0.1:9553");
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    preview.dispose();
    repository.close();
  });
  server.closeIdleConnections();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
