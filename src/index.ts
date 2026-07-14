import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3010);
const app = createApp();
console.log(`ong-match-back listening on :${port}`);

export default { port, fetch: app.fetch };
