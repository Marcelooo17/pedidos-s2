# Bitácora · Arquitecturas y procesos · Marcelo Morales

## Entorno
| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | 12th Gen Intel(R) Core(TM) i3-1215U, 16 GB |
| nucleos según /metricas | 8 |
| MAX_TRABAJADORES y MAX_COLA | 8 y 16 |
| Duración de un reporte con n=2000000 | 319 ms |

## 1. Resultados
| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | bucle.maxMs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (/health) | 16 ms | 133 ms | 2732 | 0 | 0 | 8015 ms |
| 2 · worker sin límite | 7121 ms | 9286 ms | 116 | 0 | 0 | 314 ms |
| 3 · pool con límite | 41 ms | 5690 ms | 98 | 10660 | 0 | 142 ms |

(La columna 503 muestra las respuestas non 2xx de autocannon; en el escenario 3 todas son 503.)

### Escenario 1 · bloqueo

Peticiones totales: 2732 | 2xx: 2732 | non2xx: 0 | errores: 0 | timeouts: 0
Latencia: p50 16 ms, p99 60 ms, max 133 ms

Respuesta de /metricas:

```json
{
    "umbralLentaMs":  1000,
    "bucle":  {
                  "p50Ms":  10,
                  "p99Ms":  24,
                  "maxMs":  8015
              },
    "nucleos":  8,
    "rutas":  [
                  {
                      "ruta":  "GET /health",
                      "peticiones":  2752,
                      "promedioMs":  1,
                      "maxMs":  11,
                      "lentas":  0
                  },
                  {
                      "ruta":  "GET /reporte/bloqueante",
                      "peticiones":  2,
                      "promedioMs":  8001,
                      "maxMs":  8001,
                      "lentas":  2
                  }
              ],
    "pool":  {
                 "maxTrabajadores":  8,
                 "activos":  0,
                 "enCola":  0,
                 "maxCola":  16,
                 "rechazadas":  0
             }
}
```

### Escenario 2 · worker sin límite

Peticiones totales: 116 | 2xx: 116 | non2xx: 0 | errores: 0 | timeouts: 0
Latencia: p50 7121 ms, p99 9280 ms, max 9286 ms

Respuesta de /metricas:

```json
{
    "umbralLentaMs":  1000,
    "bucle":  {
                  "p50Ms":  10,
                  "p99Ms":  63,
                  "maxMs":  314
              },
    "nucleos":  8,
    "rutas":  [
                  {
                      "ruta":  "GET /reporte/worker",
                      "peticiones":  116,
                      "promedioMs":  6779,
                      "maxMs":  8922,
                      "lentas":  116
                  }
              ],
    "pool":  {
                 "maxTrabajadores":  8,
                 "activos":  0,
                 "enCola":  0,
                 "maxCola":  16,
                 "rechazadas":  0
             }
}
```

### Escenario 3 · pool con límite

Peticiones totales: 10758 | 2xx: 98 | non2xx: 10660 | errores: 0 | timeouts: 0
Latencia: p50 41 ms, p99 366 ms, max 5690 ms

Respuesta de /metricas:

```json
{
    "umbralLentaMs":  1000,
    "bucle":  {
                  "p50Ms":  10,
                  "p99Ms":  74,
                  "maxMs":  142
              },
    "nucleos":  8,
    "rutas":  [
                  {
                      "ruta":  "GET /reporte/pool",
                      "peticiones":  10784,
                      "promedioMs":  41,
                      "maxMs":  5552,
                      "lentas":  98
                  }
              ],
    "pool":  {
                 "maxTrabajadores":  8,
                 "activos":  0,
                 "enCola":  0,
                 "maxCola":  16,
                 "rechazadas":  10686
             }
}
```

## 2. Análisis
**1. Escenario 1 (bloqueo).**
bucle.maxMs fue 8015 ms y el maxMs de GET /health en rutas fue 11 ms.
El monitor del bucle usa un temporizador en el mismo hilo: cuando /reporte/bloqueante lo ocupó unos 8 s, el temporizador se disparó 8 s tarde y quedó registrado, por eso ve el bloqueo.
El interceptor solo arranca su cronómetro cuando el middleware por fin se ejecuta, con el hilo ya libre; la espera en la cola del socket queda fuera de su medición.
Es lo mismo que pasó en el trabajo en clase: 4.01 s en el navegador contra 1 ms en el interceptor.

**2. Escenario 2 (worker sin límite).**
Se completaron 116 peticiones (todas 2xx) y 0 terminaron en timeout, pero todas fueron lentas (lentas: 116, p50 7121 ms, máximo 9286 ms), muy cerca del límite de 10 s de autocannon.
Un reporte solo tarda unos 319 ms, pero con 50 a la vez se crean 50 hilos que compiten por 8 núcleos lógicos y cada uno paga además el costo de arrancar su worker.
Sin límite no hay cola ordenada: se lograron unos 6 reportes por segundo, muy por debajo de lo que sugerirían 8 núcleos, y todos los clientes esperaron segundos a la vez.

**3. Escenario 3 (pool con límite).**
Hubo 98 respuestas 2xx y 10660 respuestas 503 (el pool contó 10686 rechazadas), con 0 timeouts.
Un 503 inmediato con Retry-After es un fallo explícito y detectable: el cliente sabe al instante que el servidor está vivo pero saturado, que su petición no se ejecutó y cuándo reintentar (fail-fast).
Un timeout es un fallo de tiempo ambiguo: tras esperar segundos el cliente no sabe si el servidor está caído, lento o si procesó la petición, y ya gastó tiempo y una conexión.
La latencia p50 fue 41 ms contra 7121 ms sin límite, aunque la mayoría de esas respuestas son rechazos rápidos.

**4. Efecto de ignorar Retry-After.**
autocannon reintentó enseguida: el pool recibió 10784 peticiones en 20 s (unas 540 por segundo), casi todas rechazadas.
Rechazar es barato, pero ocupó el hilo principal (bucle.p99Ms 74 y maxMs 142) y solo se completaron 98 reportes, menos que los 116 del escenario 2.
Un cliente bien diseñado respeta Retry-After (espera al menos 1 s), usa backoff exponencial con jitter, limita el número de reintentos y usa un circuit breaker.

**5. Tres réplicas.**
Cada réplica tiene su propia memoria: GET /metricas a través del balanceador mostraría los datos de una sola réplica, distintos en cada llamada, y nunca el total.
Cada réplica admite 8 reportes activos y 16 en cola, así que habría hasta 24 simultáneos en ejecución y 48 en cola (72 en total).
En una sola laptop de 8 núcleos serían 3 x 8 hilos compitiendo, es decir, sobresuscripción.
Cambiaría: una cola compartida (Redis o RabbitMQ) con límite global, MAX_TRABAJADORES por réplica igual a núcleos entre réplicas, métricas exportadas por réplica y agregadas en un sistema central (Prometheus), y un balanceador que reintente un 503 en otra réplica.

## 3. Problemas encontrados
- El proyecto base no incluía worker-reporte.ts ni /reporte/worker, así que los reconstruí.
- autocannon se ejecutó dentro de Docker (imagen con autocannon@8) en lugar de npx en el host.
- En el escenario 1 autocannon reportó latencia máxima de solo 133 ms aunque bucle.maxMs fue 8015 ms. Probablemente el bloqueo coincidió sobre todo con el arranque del contenedor de autocannon y no con su ventana de medición; sería más fiable lanzar el reporte bloqueante cuando autocannon ya está corriendo.

## 4. Uso declarado de IA
Usé Claude como asistente para armar el código (pool.ts, metricas.ts, index.ts), los comandos de medición y la redacción del análisis. Ejecuté las pruebas en mi equipo y los datos son de mis ejecuciones.

