import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket Server for Stratum Proxy
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let poolSocket: net.Socket | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "CONNECT_POOL") {
          const { host, port, worker, password } = message;
          
          if (poolSocket) {
            poolSocket.destroy();
          }

          poolSocket = new net.Socket();
          
          poolSocket.connect(port, host, () => {
            ws.send(JSON.stringify({ type: "POOL_CONNECTED", host, port }));
            
            // Step 1: Subscribe
            const subscribe = JSON.stringify({
              id: 1,
              method: "mining.subscribe",
              params: ["NativeAndroidMiner/1.0.0", null]
            }) + "\n";
            poolSocket?.write(subscribe);
          });

          poolSocket.on("data", (poolData) => {
            const lines = poolData.toString().split("\n");
            lines.forEach(line => {
              if (!line.trim()) return;
              
              try {
                const data = JSON.parse(line);
                
                // Step 2: Polite Authorization
                if (data.id === 1) {
                  const politePassword = `${password || 'x'},testing_native_android_please_do_not_kick`;
                  const authorize = JSON.stringify({
                    id: 2,
                    method: "mining.authorize",
                    params: [worker, politePassword]
                  }) + "\n";
                  poolSocket?.write(authorize);
                }

                ws.send(JSON.stringify({ type: "POOL_DATA", data: line }));
              } catch (e) {
                ws.send(JSON.stringify({ type: "POOL_DATA", data: line }));
              }
            });
          });

          poolSocket.on("error", (err) => {
            ws.send(JSON.stringify({ type: "POOL_ERROR", message: err.message }));
          });

          poolSocket.on("close", () => {
            ws.send(JSON.stringify({ type: "POOL_DISCONNECTED" }));
          });
        }

        if (message.type === "SEND_STRATUM") {
          if (poolSocket && !poolSocket.destroyed) {
            poolSocket.write(message.data + "\n");
          }
        }
      } catch (err) {
        console.error("WS Error:", err);
      }
    });

    ws.on("close", () => {
      if (poolSocket) {
        poolSocket.destroy();
      }
    });
  });
}

startServer();
