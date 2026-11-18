import express from "express";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { medirLatencia, resumenMetricas } from "./metricas";
import { contarPrimosEnPool, estadoPool } from "./pool";

const app = express();
app.use(express.json());
app.use(medirLatencia);

function leerN(valor: unknown): number {
  const n = Number(valor ?? 2000000);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 2000000;
}

app.get("/health", (_req, res) => {
  res.json({ estado: "ok" });
});

// Reporte que congela el servicio (bucle síncrono de ~8 s)
app.get("/reporte/bloqueante", (_req, res) => {
  const fin = Date.now() + 8000;
  while (Date.now() < fin) {
    // ocupa el único hilo de Node
  }
  res.json({ reporte: "listo" });
});

// Un hilo por petición, sin límite
app.get("/reporte/worker", (req, res) => {
  const n = leerN(req.query.n);
  const w = new Worker(path.join(__dirname, "worker-reporte.js"), { workerData: { n } });
  w.once("message", (r) => res.json({ modo: "worker", ...r }));
  w.once("error", (e) => res.status(500).json({ error: e.message }));
});

// Pool con límite
app.get("/reporte/pool", async (req, res) => {
  const n = leerN(req.query.n);
  try {
    const r = await contarPrimosEnPool(n);
    res.json({ modo: "pool", ...r });
  } catch (e) {
    const err = e as Error;
    if (err.name === "PoolLleno") {
      res.set("Retry-After", "1").status(503).json({ error: "PoolLleno", pool: estadoPool() });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get("/metricas", (_req, res) => {
  res.json({ ...resumenMetricas(), pool: estadoPool() });
});

app.listen(3000, () => console.log("Pedidos escuchando en :3000"));
