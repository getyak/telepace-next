import type { Config } from "tailwindcss";
import preset from "@telepace/ui/tailwind";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [preset as Config],
  theme: { extend: {} },
  plugins: [],
};

export default config;
