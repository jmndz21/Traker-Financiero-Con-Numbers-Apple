# Traker Financiero

Panel de análisis de ingresos y gastos a partir de tu hoja de cálculo de Numbers.
Es una web 100% estática: todo el análisis se calcula **en tu navegador**, nada se
sube a ningún servidor ni se guarda entre sesiones. Por eso, cada vez que entras,
la web te pide el archivo actualizado.

## Uso

1. Abre tu hoja en la app **Numbers** del iPhone/Mac.
2. Toca **⋯** → **Exportar** → **CSV** o **Excel** → guarda en Archivos/iCloud Drive.
3. Abre la web y selecciona ese archivo (o arrástralo, en escritorio).
4. La web reconoce las columnas `Tipo`, `Nombre`, `Precio`, `Categoría`, `Cuenta`
   y `Fecha` (con o sin los emoji que Numbers añade a las cabeceras) y calcula:
   - Balance, ingresos, gastos y tasa de ahorro
   - Evolución mensual de ingresos vs. gastos, y balance mes a mes
   - Gasto por categoría y por cuenta
   - Patrón de gasto por día de la semana / franja horaria
   - "Gastos hormiga": categorías con muchos movimientos pequeños
   - Top 10 gastos más grandes
   - Tabla de movimientos filtrable y con buscador

## Instalar en el iPhone (como una app)

1. Abre la URL de GitHub Pages en **Safari** (tiene que ser Safari, no Chrome).
2. Toca el icono de compartir (cuadrado con flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.
4. Se añade un icono normal: se abre a pantalla completa, sin la barra de Safari,
   y funciona sin conexión (la app en sí; para analizar datos nuevos sigues
   necesitando abrir/seleccionar el archivo exportado).

## Despliegue (GitHub Pages)

El repo incluye `.github/workflows/pages.yml`, que despliega automáticamente en
cada push a `main`. Solo hace falta habilitarlo **una vez**:

1. En GitHub → **Settings** → **Pages**.
2. En "Build and deployment" → **Source**, elige **GitHub Actions**.
3. Haz push a `main` (o fusiona esta rama) y espera a que termine el workflow
   **"Deploy to GitHub Pages"** en la pestaña Actions.
4. La URL aparecerá en Settings → Pages, con el formato
   `https://<usuario>.github.io/<repositorio>/`.

## Privacidad

No hay backend, base de datos ni analítica. El archivo que subes se procesa con
JavaScript en tu propio dispositivo y desaparece en cuanto cierras o recargas la
pestaña — perfecto para datos financieros personales.

## Estructura del proyecto

```
index.html          Estructura de la página (pantalla de carga + dashboard)
css/styles.css       Estilos y tokens de color (tema claro/oscuro)
js/parser.js          Lee y normaliza el CSV/XLSX exportado
js/analytics.js       Cálculos: agregados por mes/categoría/cuenta/franja horaria
js/charts.js           Renderizado de gráficas (Chart.js) y el mapa de calor
js/app.js               Interfaz: carga de archivo, filtros, tablas
manifest.json + service-worker.js   Soporte PWA (instalable, funciona offline)
```
