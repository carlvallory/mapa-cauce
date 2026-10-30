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
| POST | `/api/puntos` | Crea un punto `{lat, lng, cauce?, tipo?, descripcion?}` (`cauce`: `peru` / `antequera`); responde con una `clave` para poder borrarlo |
| PATCH | `/api/puntos/<id>` | Cambia el estado `{estado: "pendiente" \| "limpiado", nota?}` (solo con `X-Admin-Token`) |
| DELETE | `/api/puntos/<id>` | Borra un punto (header `X-Clave-Punto` de quien lo marcó, o `X-Admin-Token`) |
| GET | `/api/puntos.csv` | Planilla para Excel, con hora de Paraguay y enlace a Google Maps |
| GET | `/api/puntos.geojson` | Los puntos en GeoJSON (QGIS, Google My Maps, etc.) |

El servidor rechaza puntos fuera del radio, limita a 30 puntos por hora por
conexión y corta las descripciones en 500 caracteres. No guarda IPs.

## Configuración (variables de entorno)

| Variable | Por defecto | Para qué |
|---|---|---|
| `CENTRO_LAT`, `CENTRO_LNG` | `-25.277576`, `-57.619978` | Centro de la obra |
| `RADIO_M` | `750` | Radio en metros |
| `ADMIN_TOKEN` | vacío (nadie puede borrar ni marcar limpiados) | Clave de administración: borrar puntos y marcarlos como limpiados |
| `DB_PATH` | `./puntos.db` | Archivo SQLite |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | Dónde escucha |
| `ZONA_HORARIA` | `America/Asuncion` | Hora de la planilla CSV |

## Probar en local

```bash
CENTRO_LAT=-25.27 CENTRO_LNG=-57.62 ADMIN_TOKEN=prueba python3 server.py
# abrir http://127.0.0.1:8080
```

## Despliegue (nginx + systemd)

Pensado para un Ubuntu con nginx, certbot y git. En `despliegue/` están el
servicio de systemd y el sitio de nginx. La app corre como `www-data` en
`127.0.0.1:8101` y guarda la base en `/var/lib/mapa-cauce/puntos.db`.

**1. DNS.** Crear el registro `cauces` (A a la IP del servidor, o CNAME a
`muci.org`) **sin el proxy de Cloudflare**, para que el servidor vea la IP real
de cada persona.

**2. En el servidor, como root:**

```bash
# Código (el repo es público: no hacen falta credenciales)
git clone https://github.com/carlvallory/mapa-cauce.git /var/www/areas/global/mapa-cauce
cd /var/www/areas/global/mapa-cauce

# Clave para borrar puntos. Guardarla en el gestor de contraseñas.
echo "ADMIN_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')" > .env
chown root:www-data .env && chmod 640 .env
cat .env

# Servicio
cp despliegue/mapa-cauce.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now mapa-cauce
curl -s http://127.0.0.1:8101/api/config   # debe mostrar el centro y "radio": 750.0

# Certificado y nginx
certbot certonly --nginx -d cauces.muci.org
cp despliegue/cauces.muci.org.nginx /etc/nginx/sites-available/cauces.muci.org
ln -s /etc/nginx/sites-available/cauces.muci.org /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**3. Probar** `https://cauces.muci.org` desde un teléfono con datos móviles.

**Actualizar** más adelante (la base de datos no se toca):

```bash
cd /var/www/areas/global/mapa-cauce && git pull && systemctl restart mapa-cauce
```

## Borrar puntos

- **Quien marcó un punto** lo puede borrar desde el mismo teléfono: en "Ver
  puntos" aparece "Borrar" al lado de "Ver", y una ventana pide confirmar. Al
  guardar un punto, el servidor devuelve una clave que queda en ese navegador;
  en la base solo se guarda su hash. Si se borran los datos del navegador, esa
  persona ya no puede borrarlo (la administración sí).
- **Administración** puede borrar cualquier punto. Abrir una vez en el teléfono
  `https://cauces.muci.org/#admin=LA_CLAVE` (la clave está en `.env`). Va
  después de `#` a propósito: esa parte de la dirección no viaja al servidor,
  así que la clave no queda en ningún log.

## Puntos limpiados

Cada punto está **pendiente** o **limpiado**. Solo la administración cambia el
estado: en modo administrador aparece "Limpio ✓" en la lista ("Marcar como
limpiado" en el popup), con una ventana que pide confirmar y admite una nota
opcional (por ejemplo, quién limpió). Queda guardada la fecha. "Reabrir" lo
vuelve a pendiente y borra la fecha y la nota.

Los puntos limpiados siguen a la vista de todos, en verde, en el mapa, la
lista, el PDF (con columna "Estado" y el conteo de pendientes y limpiados), la
planilla CSV y el GeoJSON. Borrar sigue siendo para errores o duplicados.

## Numeración

El número de cada punto es su id en la base y **no cambia nunca**: si se borra
el punto 3, el 4 sigue siendo 4 (queda un hueco). Es a propósito, para que un
número que ya se mencionó en un mensaje o en la planilla siga señalando el
mismo lugar.

## Respaldo

Todo está en el archivo `puntos.db`. Para copiarlo con el servidor andando:
`sqlite3 /var/lib/mapa-cauce/puntos.db ".backup puntos-respaldo.db"` (requiere el paquete `sqlite3`).
