import express from "express";
import path from "path";
import os from "os";
import { createServer as createViteServer } from "vite";
import { PORT } from "./server/config";
import routes from "./server/routes";

function getLocalIpAddresses() {
  const ipList: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    const interfacesList = interfaces[interfaceName];
    if (interfacesList) {
      for (const iface of interfacesList) {
        // Skip over non-IPv4, internal (127.0.0.1) and link-local (169.254.x.x) addresses
        if (
          iface.family === "IPv4" &&
          !iface.internal &&
          !iface.address.startsWith("169.254.")
        ) {
          ipList.push(iface.address);
        }
      }
    }
  }
  return ipList;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Mount all API and SSE routes
  app.use(routes);

  // Vite Integration for HMR and Client Serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all other routing in SPA mode
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const networkIps = getLocalIpAddresses();
    console.log(`[Full-Stack App] Server started successfully:`);
    console.log(`  > Local:   http://localhost:${PORT}`);
    if (networkIps.length > 0) {
      networkIps.forEach(ip => {
        console.log(`  > Network: http://${ip}:${PORT}`);
      });
    } else {
      console.log(`  > Network: (not found, check your network connection)`);
    }
  });
}

startServer().catch(err => {
  console.error("Express startup failed:", err);
});
