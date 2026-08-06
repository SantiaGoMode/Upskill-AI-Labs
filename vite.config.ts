import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      // Bindings live in wrangler.jsonc so local development and deployment
      // cannot drift apart.
      configPath: "./wrangler.jsonc",
    }),
  ],
});
