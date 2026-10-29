# HANDOFF — Mapa del Cauce

## Estado actual (2026-10-29)

La web está completa y probada en local, pero **no está desplegada**.

- Código: `server.py` (Python sin dependencias + SQLite) y `static/index.html`.
- Despliegue: `README.md` (systemd + nginx).
- Los puntos están numerados: el número aparece en el pin del mapa, en el
  popup, en la lista y en la planilla CSV/GeoJSON. Es el id de la base y no
  cambia aunque se borren otros puntos.
- Hay campo opcional de cauce (Perú / Antequera), además del tipo de
  obstrucción y la descripción.
- **PDF para la Municipalidad:** botón en "Ver puntos". Genera en el navegador
  un A4 con el mapa y los puntos numerados (página 1) y una tabla con número,
  cauce, tipo, descripción, coordenadas enlazadas a Google Maps y fecha
  (página 2 en adelante). Usa Poppins embebida y la paleta del MuCi, y respeta
  la capa elegida en pantalla (calles o satélite).
- Centro: **-25.277576, -57.619978** (la obra). Ya es el
  valor por defecto en `server.py`.
- Radio: **500 m** (se eligió sobre 300 m para que se vea mejor el entorno).

## Contexto del pedido

El pedido viene del equipo del MuCi (2026-10-29). Los referentes del barrio temen la crecida del río y piden a instituciones públicas
la limpieza de los cauces **Perú** y **Antequera**, que lindan con la obra. Ellos
marcan los puntos críticos prioritarios y el mapa se envía a la Municipalidad.

## Qué falta

1. **Desplegar en producción** en `cauces.muci.org` siguiendo el README
   (pasos 1 a 4). Los archivos están en `despliegue/`; puerto 8101.
2. Probar en un teléfono real con HTTPS, incluida la descarga del PDF
   (en iPhone el PDF se abre en el visor y se guarda desde "Compartir").

## Ideas no pedidas (solo si las piden)

- Campo de prioridad, fotos por punto, o marcar puntos como "limpiado".
