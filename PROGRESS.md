# PROGRESS — Mapa del Cauce

## 2026-10-29 — Primera versión de la web

- Web para teléfono con un mapa del radio de 500 m alrededor de la obra del
  MuCi. Cualquiera puede marcar puntos sin login, con tipo de obstrucción y
  descripción opcionales, y ver la lista de puntos con sus descripciones.
- Exportación para la Municipalidad: CSV (hora de Paraguay, enlace a Google
  Maps y protección contra fórmulas de Excel) y GeoJSON.
- Moderación: borrado de puntos con `ADMIN_TOKEN` (`?admin=CLAVE` en la URL).
- Probado en local: la API con casos válidos e inválidos (fuera del radio, tipo
  inválido, JSON mal formado, NaN, path traversal, sin token, tope de 30 por
  hora) y el flujo completo en Playwright a 390×844.
- Pendiente: coordenadas reales de la obra y despliegue en producción.

## 2026-10-29 — Numeración de puntos y campo de cauce

- Los pines del mapa muestran el número del punto, que también aparece en el
  popup, la lista y la planilla. Es el id de la base y no cambia, para que la
  Municipalidad pueda identificar cada punto con su descripción.
- Según el pedido del equipo del MuCi: campo opcional "¿En qué cauce?"
  (Perú / Antequera), que también sale en el CSV y el GeoJSON. Los textos de
  la página toman el radio de la configuración en vez de decir "500 m" fijo.
- Migración automática: una base existente recibe la columna `cauce` al
  arrancar (probado sobre la base de prueba anterior).
- Probado en local con Playwright a 390×844: pines numerados, popup con cauce
  y tipo, y formulario con el selector de cauce.
- Pendiente: coordenadas reales, definir el radio (300 o 500 m) y desplegar.

## 2026-10-29 — PDF para la Municipalidad

- Botón "Descargar PDF para la Municipalidad" en la lista de puntos. Genera un
  A4 en el navegador: encabezado con degradado violeta→rosa, resumen por cauce,
  mapa del radio con los puntos numerados (escala, norte y atribución) y una
  tabla con número, cauce, tipo, descripción, coordenadas que abren Google Maps
  y fecha. Poppins Regular y Bold embebidas.
- Antes de armar el PDF pide los puntos al servidor, así incluye lo último
  cargado. Si algún tile del mapa no carga, avisa.
- Probado: descarga desde el navegador; pdffonts confirma Poppins embebida y
  se revisaron las dos páginas renderizadas.
- Se confirmó el radio de 500 m.

## 2026-10-29 — Coordenadas reales de la obra

- El centro del mapa es ahora la obra del MuCi (-25.277576, -57.619978) y quedó como valor por defecto en `server.py`, así que el servicio
  no necesita configurar `CENTRO_LAT`/`CENTRO_LNG`.
- Verificado en el navegador: el círculo de 500 m queda sobre la obra, entre la
  Costanera y el Parque Caballero, en las vistas de calles y de satélite.
- Pendiente: despliegue en producción.
