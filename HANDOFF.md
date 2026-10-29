# HANDOFF — Mapa del Cauce

## Estado actual (2026-10-29)

**En producción: https://cauces.muci.org** — instalada, probada y con la base
vacía, lista para compartir con los referentes.

- Servidor: servicio `mapa-cauce` (systemd, www-data, 127.0.0.1:8101), código
  en `/var/www/areas/global/mapa-cauce` (clon del repo), base en
  `/var/lib/mapa-cauce/puntos.db`, clave de borrado en `.env` de esa carpeta.
  Certificado de Let's Encrypt hasta 2027-01-27 (renovación de certbot).
- Repo público: https://github.com/carlvallory/mapa-cauce (rama `main`).
  No subir datos personales ni detalles internos del servidor.
- Actualizar: `cd /var/www/areas/global/mapa-cauce && git pull` (los archivos
  de la página se sirven al momento; reiniciar el servicio solo si cambia
  `server.py`). Si cambian los archivos de `despliegue/`, copiarlos a
  `/etc/...` y recargar.
- Funciones: puntos numerados (el número no cambia nunca), cauce Perú /
  Antequera, tipo y descripción opcionales, lista, CSV, GeoJSON y PDF para la
  Municipalidad. Radio de **750 m**, centro -25.277576, -57.619978.
- Borrar: quien marcó un punto puede borrarlo desde el mismo teléfono (botón
  "Borrar" en la lista, con ventana de confirmación). El modo administrador
  (`https://cauces.muci.org/#admin=CLAVE`) borra cualquiera.
- **Pendiente de desplegar** (2026-10-29): el botón "Borrar" para quien marcó
  el punto. Requiere `git pull` **y** `systemctl restart mapa-cauce`, porque
  cambia `server.py` y la base suma la columna `clave_hash` al arrancar.
- Para empezar de cero (y que la numeración vuelva a 1): parar el servicio,
  borrar `puntos.db*` en `/var/lib/mapa-cauce/` y arrancarlo.

## Contexto del pedido

El pedido viene del equipo del MuCi (2026-10-29). Los referentes del barrio temen la crecida del río y piden a instituciones públicas
la limpieza de los cauces **Perú** y **Antequera**, que lindan con la obra. Ellos
marcan los puntos críticos prioritarios y el mapa se envía a la Municipalidad.

## Qué sigue

1. Compartir el enlace con los referentes para que carguen los puntos.
2. Cuando terminen, descargar el PDF desde "Ver puntos" y enviarlo a la
   Municipalidad.

## Ideas no pedidas (solo si las piden)

- Campo de prioridad, fotos por punto, o marcar puntos como "limpiado".
