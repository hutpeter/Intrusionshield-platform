import { createApp } from "./app.js";

const port = Number(process.env.HIS_PORT ?? 4300);
const app = createApp();

app.listen(port, () => {
  console.log(`HIS service listening on port ${port}`);
});

export { createApp } from "./app.js";
