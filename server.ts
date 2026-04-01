import "dotenv/config";

import { serve } from "@hono/node-server";

import { app } from "./src/app";

const port = Number(process.env.PORT ?? 3000);

export const server = serve({
  port,
  fetch: app.fetch,
});

console.log(`@rekl0w/sanal-pos server running on http://localhost:${port}`);
