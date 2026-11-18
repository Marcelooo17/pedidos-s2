import { parentPort, workerData } from "node:worker_threads";

function contarPrimos(n: number): number {
  let cuenta = 0;
  for (let i = 2; i <= n; i++) {
    let primo = true;
    for (let d = 2; d * d <= i; d++) {
      if (i % d === 0) { primo = false; break; }
    }
    if (primo) cuenta++;
  }
  return cuenta;
}

const inicio = performance.now();
const primos = contarPrimos(workerData.n);
parentPort!.postMessage({ n: workerData.n, primos, ms: Math.round(performance.now() - inicio) });
