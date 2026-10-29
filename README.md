# Mapa del Cauce

Web para teléfono donde cualquiera con el enlace puede marcar puntos donde los
cauces **Perú** y **Antequera** están obstruidos (basura, restos de obra,
vegetación u otro) dentro de un radio alrededor de la obra del MuCi en la
Costanera. Cauce, tipo y descripción son opcionales. Cada punto lleva un número
fijo (se ve en el mapa, en la lista y en la planilla) para que la Municipalidad
pueda identificarlo. No hay usuarios ni login. Para enviar a la Municipalidad,
la lista de puntos tiene un botón **"Descargar PDF para la Municipalidad"**
(mapa con los puntos numerados + tabla con las descripciones), además de la
planilla CSV y el GeoJSON.

## Cómo está hecho

- `server.py`: servidor en Python 3.9+ **sin dependencias** (solo biblioteca
  estándar). Sirve la página y una API JSON. Guarda los puntos en SQLite.
- `static/index.html`: la página (Leaflet + OpenStreetMap / satélite de Esri).
- `static/pdf.js`: arma el PDF en el navegador (dibuja el mapa en un canvas con
  tiles de zoom 17 y genera el documento con jsPDF; se carga al tocar el botón).
- `static/vendor/`: Leaflet 1.9.4, jsPDF 2.5.1, jspdf-autotable 3.8.2 y la
  tipografía Poppins (Regular y Bold), guardados localmente.

### API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/config` | Centro y radio del área |
| GET | `/api/puntos` | Lista de puntos (JSON) |
| POST | `/api/puntos` | Crea un punto `{lat, lng, cauce?, tipo?, descripcion?}` (`cauce`: `peru` / `antequera`) |
| DELETE | `/api/puntos/<id>` | Borra un punto (header `X-Admin-Token`) |
| GET | `/api/puntos.csv` | Planilla para Excel, con hora de Paraguay y enlace a Google Maps |
| GET | `/api/puntos.geojson` | Los puntos en GeoJSON (QGIS, Google My Maps, etc.) |

El servidor rechaza puntos fuera del radio, limita a 30 puntos por hora por
conexión y corta las descripciones en 500 caracteres. No guarda IPs.

## Configuración (variables de entorno)

| Variable | Por defecto | Para qué |
|---|---|---|
| `CENTRO_LAT`, `CENTRO_LNG` | `-25.277576`, `-57.619978` | Centro de la obra |
| `RADIO_M` | `750` | Radio en metros |
| `ADMIN_TOKEN` | vacío (nadie puede borrar) | Clave para borrar puntos |
| `DB_PATH` | `./puntos.db` | Archivo SQLite |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | Dónde escucha |
| `ZONA_HORARIA` | `America/Asuncion` | Hora de la planilla CSV |

## Probar en local

```bash
CENTRO_LAT=-25.27 CENTRO_LNG=-57.62 ADMIN_TOKEN=prueba python3 server.py
# abrir http://127.0.0.1:8080
```

## Despliegue (nginx + systemd)

Pensado para un Ubuntu con nginx y certbot. En `despliegue/` están el servicio
de systemd y el sitio de nginx, listos para copiar. Corre como `www-data` en
`127.0.0.1:8101` y guarda la base en `/var/lib/mapa-cauce/puntos.db`.

**1. DNS.** Crear el registro `A cauces → <IP del servidor>` (sin proxy de
Cloudflare, para que el servidor vea la IP real de cada persona).

**2. Subir el código** desde la máquina de quien despliega:

```bash
tar czf /tmp/mapa-cauce.tgz --exclude='*.db*' --exclude=__pycache__ server.py static despliegue
scp /tmp/mapa-cauce.tgz root@SERVIDOR:/tmp/
```

**3. En el servidor, como root:**

```bash
# Código (de root, solo lectura para www-data)
mkdir -p /var/www/areas/global/mapa-cauce
tar xzf /tmp/mapa-cauce.tgz -C /var/www/areas/global/mapa-cauce
cd /var/www/areas/global/mapa-cauce

# Clave para borrar puntos (guardarla también en el gestor de contraseñas)
echo "ADMIN_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')" > .env
chown root:www-data .env && chmod 640 .env

# Servicio
cp despliegue/mapa-cauce.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now mapa-cauce
curl -s http://127.0.0.1:8101/api/config     # debe responder el centro y el radio

# Certificado y nginx
certbot certonly --nginx -d cauces.muci.org
cp despliegue/cauces.muci.org.nginx /etc/nginx/sites-available/cauces.muci.org
ln -s /etc/nginx/sites-available/cauces.muci.org /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**4. Probar** `https://cauces.muci.org` desde un teléfono con datos móviles.

**Actualizar** más adelante: repetir el paso 2, en el servidor `tar xzf` sobre
la misma carpeta y `systemctl restart mapa-cauce`. La base no se toca.

## Borrar puntos (moderación)

Abrir una vez en el teléfono `https://cauces.muci.org/#admin=LA_CLAVE` (la clave está en `.env`).
Va después de `#` a propósito: esa parte de la dirección no viaja al servidor,
así que la clave no queda en ningún log. La clave queda
guardada en ese navegador y desde ahí cada punto muestra "Borrar este punto"
(pide confirmar con un segundo toque).

## Numeración

El número de cada punto es su id en la base y **no cambia nunca**: si se borra
el punto 3, el 4 sigue siendo 4 (queda un hueco). Es a propósito, para que un
número que ya se mencionó en un mensaje o en la planilla siga señalando el
mismo lugar.

## Respaldo

Todo está en el archivo `puntos.db`. Para copiarlo con el servidor andando:
`sqlite3 /var/lib/mapa-cauce/puntos.db ".backup puntos-respaldo.db"` (requiere el paquete `sqlite3`).
