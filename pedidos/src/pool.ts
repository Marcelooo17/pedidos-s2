import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";

export interface Resultado { n: number; primos: number; ms: number; }

const MAX_TRABAJADORES = Math.max(1, Number(process.env.MAX_TRABAJADORES ?? os.availableParallelism()));
const MAX_COLA = Number(process.env.MAX_COLA ?? MAX_TRABAJADORES * 2);

interface Trabajo { n: number; resolve: (r: Resultado) => void; reject: (e: Error) => void; }

const cola: Trabajo[] = [];
let activos = 0;
let rechazadas = 0;

function ejecutar(trabajo: Trabajo): void {
  activos++;
  const worker = new Worker(path.join(__dirname, "worker-reporte.js"), { workerData: { n: trabajo.n } });
  let terminado = false;
  const terminar = (error?: Error, resultado?: Resultado) => {
    if (terminado) return;
    terminado = true;
    activos--;
    if (error) trabajo.reject(error); else trabajo.resolve(resultado as Resultado);
    const siguiente = cola.shift();
    if (siguiente) ejecutar(siguiente);
  };
  worker.once("message", (r: Resultado) => terminar(undefined, r));
  worker.once("error", (e) => terminar(e));
  worker.once("exit", (code) => terminar(new Error(`worker termino con codigo ${code}`)));
}

export function contarPrimosEnPool(n: number): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const trabajo: Trabajo = { n, resolve, reject };
    if (activos < MAX_TRABAJADORES) {
      ejecutar(trabajo);
    } else if (cola.length < MAX_COLA) {
      cola.push(trabajo);
    } else {
      rechazadas++;
      const e = new Error("Pool lleno");
      e.name = "PoolLleno";
      reject(e);
    }
  });
}

export function estadoPool() {
  return { maxTrabajadores: MAX_TRABAJADORES, activos, enCola: cola.length, maxCola: MAX_COLA, rechazadas };
}
