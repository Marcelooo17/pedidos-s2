# S2: Métricas de Pedidos

## Tiempo de /health durante el reporte bloqueante

- Herramienta usada: navegador Chrome (F12, pestaña Network)
- Código de estado: 200
- Tiempo medido por el cliente: 4.01 s

## Respuesta de GET /metricas

```json
{
    "umbralLentaMs":  1000,
    "rutas":  [
                  {
                      "ruta":  "GET /reporte/bloqueante",
                      "peticiones":  1,
                      "promedioMs":  8007,
                      "maxMs":  8007,
                      "lentas":  1
                  },
                  {
                      "ruta":  "GET /health",
                      "peticiones":  1,
                      "promedioMs":  1,
                      "maxMs":  1,
                      "lentas":  0
                  },
                  {
                      "ruta":  "GET /.well-known/appspecific/com.chrome.devtools.json",
                      "peticiones":  2,
                      "promedioMs":  2,
                      "maxMs":  3,
                      "lentas":  0
                  },
                  {
                      "ruta":  "GET /metricas",
                      "peticiones":  1,
                      "promedioMs":  2,
                      "maxMs":  2,
                      "lentas":  0
                  }
              ]
}
```

## ¿Por qué el cliente y el interceptor miden distinto, y qué fallo ve el cliente?

El reporte bloqueante ocupa el único hilo de Node, así que el event loop no atiende nada más.
La petición a /health llega al servidor, pero espera en cola hasta que el hilo se libera.
El navegador cuenta desde que envía la petición, por eso incluye esa espera y mide segundos.
El interceptor arranca su cronómetro cuando el middleware por fin se ejecuta, con el hilo libre, y ve apenas milisegundos.
El cliente no ve un error sino una lentitud severa (latencia) que puede terminar en timeout.
