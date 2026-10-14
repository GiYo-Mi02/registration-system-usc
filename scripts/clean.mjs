import { rmSync } from "node:fs";
// Remove generated build output only, preserving application records.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
rmSync(new URL("../build/", import.meta.url), { recursive: true, force: true });
