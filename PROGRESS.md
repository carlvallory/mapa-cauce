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

## 2026-10-29 — Despliegue preparado y repo público

- Se revisó el servidor de producción en solo lectura (nginx 1.30, Ubuntu
  22.04, Python 3.10) y se armó el despliegue con el mismo esquema que las
  otras apps: `despliegue/mapa-cauce.service` (systemd, www-data, puerto 8101,
  límites de memoria y CPU) y `despliegue/cauces.muci.org.nginx` (TLS, CSP que
  permite los mapas de OSM y Esri, tope contra ráfagas). README con los pasos.
- Repo público creado: https://github.com/carlvallory/mapa-cauce. Antes de
  publicar se sacaron los datos personales y los detalles internos del
  servidor.
- Pendiente: DNS de `cauces.muci.org` e instalación en el servidor (requiere root).

## 2026-10-29 — Clave de administración fuera de los logs

- Una revisión automática de seguridad marcó que `?admin=CLAVE` dejaba la
  clave en los logs del servidor y de nginx. Ahora va como `#admin=CLAVE`
  (el fragmento no viaja al servidor) y el log del servidor ya no registra
  la query string. También funciona si el enlace se abre con la página ya
  cargada.
- Verificado: el log no contiene la clave, y el modo admin se activa y limpia
  la dirección.

## 2026-10-29 — Radio ampliado a 700 m

- `RADIO_M` pasa de 500 a 700 m por defecto. Los textos de la web y el PDF
  toman el radio de la configuración.
- PDF: el mapa se achica para que entre el círculo completo cualquiera sea el
  radio, y los pines, etiquetas y escala conservan su tamaño en la hoja.
- Probado: el servidor acepta un punto a 650 m y rechaza uno a 750 m; la web
  muestra el círculo de 700 m y el PDF lo muestra completo.

## 2026-10-29 — Radio ampliado a 750 m

- `RADIO_M` pasa de 700 a 750 m por defecto (server.py, README, HANDOFF).
- Probado: el servidor acepta un punto a 720 m y rechaza uno a 780 m. La web
  muestra el círculo de 750 m y el PDF lo incluye completo, con pines del
  mismo tamaño.

## 2026-10-29 — Subdominio cauce.muci.org y guía de instalación

- El DNS se creó como `cauce.muci.org` (CNAME a muci.org, sin proxy de
  Cloudflare). Se adaptaron el sitio de nginx (`despliegue/cauce.muci.org.nginx`),
  el README y el HANDOFF a ese nombre.
- La guía instala con `git clone` del repo público en vez de subir un tar, y
  actualiza con `git pull`.
- Carlos prefirió `cauces.muci.org`: se volvió a ese nombre (nginx, README,
  HANDOFF) y se mantiene la guía con `git clone`.

## 2026-10-29 — Instalado en cauces.muci.org y arreglo del mapa bloqueado

- Instalado en producción: servicio `mapa-cauce` activo en 127.0.0.1:8101,
  certificado de Let's Encrypt hasta 2027-01-27, nginx con redirección a
  HTTPS y encabezados de seguridad. Verificado desde afuera: API, archivos,
  CSV/GeoJSON, y que no se exponen `server.py`, `.env` ni `.git`.
- Hubo un tropiezo en la instalación: el `.env` no se creó en el primer intento
  y el servicio fallaba con "Failed to load environment files". Ahora el
  servicio arranca aunque falte el `.env` (`EnvironmentFile=-`).
- En producción, OpenStreetMap respondía "403 Access blocked" en todos los
  tiles: la política `Referrer-Policy: same-origin` de nginx impedía enviar el
  sitio de origen, que OSM exige. Se corrigió en el código (`referrerPolicy`
  en las capas de Leaflet y en los tiles del PDF) y en la plantilla de nginx.
  Probado en local con la misma política estricta: el mapa carga.
