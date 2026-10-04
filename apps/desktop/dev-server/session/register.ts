import { register } from "node:module";

// Workspace packages are TypeScript imported without extensions, the way the bundlers allow.
register("./resolve.ts", import.meta.url);
