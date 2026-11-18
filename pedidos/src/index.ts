import express from "express";

const app = express();
app.use(express.json());

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

app.listen(3000, () => console.log("Pedidos escuchando en :3000"));
