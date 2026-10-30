#!/usr/bin/env python3
"""Mapa de puntos críticos del cauce alrededor de la obra del MuCi.

Servidor sin dependencias (solo biblioteca estándar de Python 3.9+).
Sirve la página de static/ y una API JSON que guarda los puntos en SQLite.
Pensado para correr detrás de un proxy inverso (nginx) que ponga HTTPS.
"""
import csv
import hashlib
import hmac
import io
import json
import math
import os
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
DB_PATH = Path(os.environ.get("DB_PATH", BASE / "puntos.db"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
# Centro de la obra del MuCi en la Costanera Norte de Asunción.
CENTRO = (float(os.environ.get("CENTRO_LAT", "-25.277576")),
          float(os.environ.get("CENTRO_LNG", "-57.619978")))
RADIO_M = float(os.environ.get("RADIO_M", "750"))
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
ZONA = ZoneInfo(os.environ.get("ZONA_HORARIA", "America/Asuncion"))

MAX_DESC = 500
MAX_POR_HORA = 30
TIPOS = {"", "basura", "construccion", "vegetacion", "otro"}
NOMBRES_TIPO = {"": "", "basura": "Basura", "construccion": "Restos de obra",
                "vegetacion": "Ramas o vegetación", "otro": "Otro"}
CAUCES = {"": "", "peru": "Cauce Perú", "antequera": "Cauce Antequera"}
ESTADOS = {"pendiente": "Pendiente", "limpiado": "Limpiado"}
COLUMNAS = "id, lat, lng, cauce, tipo, descripcion, creado, estado, limpiado, nota_limpieza"
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8", ".png": "image/png",
                 ".svg": "image/svg+xml", ".ico": "image/x-icon",
                 ".ttf": "font/ttf"}


def distancia_m(a, b):
    """Distancia en metros entre dos (lat, lng) por haversine."""
    r = 6371008.8
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def conectar():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def iniciar_db():
    with conectar() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("""CREATE TABLE IF NOT EXISTS puntos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            tipo TEXT NOT NULL DEFAULT '',
            descripcion TEXT NOT NULL DEFAULT '',
            creado TEXT NOT NULL)""")
        columnas = {f[1] for f in con.execute("PRAGMA table_info(puntos)")}
        if "cauce" not in columnas:
            con.execute("ALTER TABLE puntos ADD COLUMN cauce TEXT NOT NULL DEFAULT ''")
        if "clave_hash" not in columnas:
            # Hash de la clave que recibe quien marcó el punto, para que pueda borrarlo.
            con.execute("ALTER TABLE puntos ADD COLUMN clave_hash TEXT NOT NULL DEFAULT ''")
        if "estado" not in columnas:
            # Solo administración pasa un punto a "limpiado"; queda la fecha y una nota opcional.
            con.execute("ALTER TABLE puntos ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'")
            con.execute("ALTER TABLE puntos ADD COLUMN limpiado TEXT NOT NULL DEFAULT ''")
            con.execute("ALTER TABLE puntos ADD COLUMN nota_limpieza TEXT NOT NULL DEFAULT ''")


def hash_clave(clave):
    return hashlib.sha256(clave.encode("utf-8")).hexdigest()


def celda_segura(texto):
    """Evita que Excel interprete una descripción como fórmula."""
    return "'" + texto if texto[:1] in ("=", "+", "-", "@", "\t", "\r") else texto


def fecha_local(iso):
    if not iso:
        return ""
    utc = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return utc.astimezone(ZONA).strftime("%Y-%m-%d %H:%M")


def listar_puntos():
    with conectar() as con:
        filas = con.execute(f"SELECT {COLUMNAS} FROM puntos ORDER BY id").fetchall()
    return [dict(f) for f in filas]


class Limitador:
    """Tope de puntos por IP por hora, en memoria (no se guardan IPs)."""

    def __init__(self, maximo, ventana_s=3600):
        self.maximo, self.ventana = maximo, ventana_s
        self.registro = defaultdict(deque)
        self.lock = threading.Lock()

    def permitir(self, ip):
        ahora = time.monotonic()
        with self.lock:
            q = self.registro[ip]
            while q and ahora - q[0] > self.ventana:
                q.popleft()
            if len(q) >= self.maximo:
                return False
            q.append(ahora)
            return True


limitador = Limitador(MAX_POR_HORA)


class Handler(BaseHTTPRequestHandler):
    server_version = "MapaCauce/1.0"

    def log_message(self, fmt, *args):
        # Sin query string: lo que venga en la URL no tiene por qué quedar en el log.
        linea = (fmt % args).replace(self.requestline, f"{self.command} {urlparse(self.path).path}")
        print("%s %s" % (self.ip(), linea), flush=True)

    def ip(self):
        # El servidor escucha solo en localhost, así que el proxy es el único cliente.
        reenviada = self.headers.get("X-Forwarded-For", "")
        return reenviada.split(",")[0].strip() or self.client_address[0]

    def enviar(self, codigo, cuerpo, tipo="application/json; charset=utf-8", extra=None):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False)
        if isinstance(cuerpo, str):
            cuerpo = cuerpo.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for clave, valor in (extra or {}).items():
            self.send_header(clave, valor)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(cuerpo)

    def error(self, codigo, mensaje):
        self.enviar(codigo, {"error": mensaje})

    # --- GET -------------------------------------------------------------

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        ruta = urlparse(self.path).path
        if ruta == "/api/config":
            self.enviar(200, {"centro": {"lat": CENTRO[0], "lng": CENTRO[1]}, "radio": RADIO_M,
                              "maxDescripcion": MAX_DESC})
        elif ruta == "/api/puntos":
            self.enviar(200, listar_puntos(), extra={"Cache-Control": "no-store"})
        elif ruta == "/api/puntos.csv":
            self.enviar(200, self.csv(), "text/csv; charset=utf-8",
                        {"Content-Disposition": f'attachment; filename="{self.nombre_archivo()}.csv"'})
        elif ruta == "/api/puntos.geojson":
            self.enviar(200, self.geojson(), "application/geo+json; charset=utf-8",
                        {"Content-Disposition": f'attachment; filename="{self.nombre_archivo()}.geojson"'})
        else:
            self.estatico(ruta)

    def nombre_archivo(self):
        return "puntos-criticos-cauce-" + datetime.now().strftime("%Y-%m-%d")

    def csv(self):
        salida = io.StringIO()
        salida.write("﻿")  # BOM para que Excel respete los acentos
        w = csv.writer(salida)
        w.writerow(["numero", "latitud", "longitud", "cauce", "tipo", "descripcion", "fecha", "estado",
                    "fecha_limpieza", "nota_limpieza", "google_maps"])
        for p in listar_puntos():
            w.writerow([p["id"], p["lat"], p["lng"], CAUCES.get(p["cauce"], p["cauce"]), NOMBRES_TIPO.get(p["tipo"], p["tipo"]), celda_segura(p["descripcion"]),
                        fecha_local(p["creado"]), ESTADOS.get(p["estado"], p["estado"]), fecha_local(p["limpiado"]),
                        celda_segura(p["nota_limpieza"]), f"https://www.google.com/maps?q={p['lat']},{p['lng']}"])
        return salida.getvalue()

    def geojson(self):
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lng"], p["lat"]]},
             "properties": {"numero": p["id"], "cauce": CAUCES.get(p["cauce"], p["cauce"]), "tipo": NOMBRES_TIPO.get(p["tipo"], p["tipo"]),
                            "descripcion": p["descripcion"], "fecha_utc": p["creado"],
                            "estado": ESTADOS.get(p["estado"], p["estado"]), "limpiado_utc": p["limpiado"],
                            "nota_limpieza": p["nota_limpieza"]}}
            for p in listar_puntos()]}

    def estatico(self, ruta):
        relativa = "index.html" if ruta in ("/", "") else ruta.lstrip("/")
        archivo = (STATIC / relativa).resolve()
        if not archivo.is_relative_to(STATIC) or not archivo.is_file():
            return self.error(404, "No encontrado")
        cache = "public, max-age=604800" if "/vendor/" in ruta else "no-cache"
        self.enviar(200, archivo.read_bytes(), CONTENT_TYPES.get(archivo.suffix, "application/octet-stream"),
                    {"Cache-Control": cache})

    # --- POST: nuevo punto -----------------------------------------------

    def do_POST(self):
        if urlparse(self.path).path != "/api/puntos":
            return self.error(404, "No encontrado")
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0 or largo > 4096:
            return self.error(413, "El pedido es demasiado grande.")
        try:
            datos = json.loads(self.rfile.read(largo))
            lat, lng = float(datos["lat"]), float(datos["lng"])
            tipo = str(datos.get("tipo") or "")
            cauce = str(datos.get("cauce") or "")
            descripcion = str(datos.get("descripcion") or "").strip()
        except (ValueError, KeyError, TypeError, AttributeError):
            return self.error(400, "Faltan la latitud y la longitud del punto.")
        if not (math.isfinite(lat) and math.isfinite(lng)):
            return self.error(400, "Las coordenadas no son válidas.")
        if distancia_m(CENTRO, (lat, lng)) > RADIO_M + 5:
            return self.error(400, f"El punto está fuera del área de {RADIO_M:.0f} m alrededor de la obra.")
        if tipo not in TIPOS:
            return self.error(400, "El tipo de obstrucción no es válido.")
        if cauce not in CAUCES:
            return self.error(400, "El cauce no es válido.")
        if not limitador.permitir(self.ip()):
            return self.error(429, "Se cargaron muchos puntos seguidos desde esta conexión. Probá de nuevo en un rato.")
        creado = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        # La clave viaja una sola vez, en esta respuesta; en la base queda solo su hash.
        clave = secrets.token_urlsafe(18)
        with conectar() as con:
            cur = con.execute("INSERT INTO puntos (lat, lng, cauce, tipo, descripcion, creado, clave_hash) "
                              "VALUES (?, ?, ?, ?, ?, ?, ?)",
                              (round(lat, 7), round(lng, 7), cauce, tipo, descripcion[:MAX_DESC], creado,
                               hash_clave(clave)))
            nuevo = dict(con.execute(f"SELECT {COLUMNAS} FROM puntos WHERE id = ?",
                                     (cur.lastrowid,)).fetchone())
        nuevo["clave"] = clave
        self.enviar(201, nuevo)

    # --- PATCH: solo administración cambia el estado (pendiente / limpiado) --

    def do_PATCH(self):
        partes = urlparse(self.path).path.strip("/").split("/")
        if len(partes) != 3 or partes[:2] != ["api", "puntos"] or not partes[2].isdigit():
            return self.error(404, "No encontrado")
        id_punto = int(partes[2])
        token = self.headers.get("X-Admin-Token", "")
        if not (ADMIN_TOKEN and hmac.compare_digest(token, ADMIN_TOKEN)):
            return self.error(403, "Solo la administración puede cambiar el estado de un punto.")
        largo = int(self.headers.get("Content-Length") or 0)
        if largo <= 0 or largo > 4096:
            return self.error(413, "El pedido es demasiado grande.")
        try:
            datos = json.loads(self.rfile.read(largo))
            estado = str(datos["estado"])
            nota = str(datos.get("nota") or "").strip()[:MAX_DESC]
        except (ValueError, KeyError, TypeError, AttributeError):
            return self.error(400, "Falta el estado del punto.")
        if estado not in ESTADOS:
            return self.error(400, "El estado no es válido.")
        if estado == "limpiado":
            limpiado = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            limpiado, nota = "", ""
        with conectar() as con:
            cur = con.execute("UPDATE puntos SET estado = ?, limpiado = ?, nota_limpieza = ? WHERE id = ?",
                              (estado, limpiado, nota, id_punto))
            if not cur.rowcount:
                return self.error(404, "Ese punto ya no existe.")
            punto = dict(con.execute(f"SELECT {COLUMNAS} FROM puntos WHERE id = ?", (id_punto,)).fetchone())
        self.enviar(200, punto)

    # --- DELETE: quien marcó el punto (con su clave) o administración --------

    def do_DELETE(self):
        partes = urlparse(self.path).path.strip("/").split("/")
        if len(partes) != 3 or partes[:2] != ["api", "puntos"] or not partes[2].isdigit():
            return self.error(404, "No encontrado")
        id_punto = int(partes[2])
        token = self.headers.get("X-Admin-Token", "")
        clave = self.headers.get("X-Clave-Punto", "")
        with conectar() as con:
            fila = con.execute("SELECT clave_hash FROM puntos WHERE id = ?", (id_punto,)).fetchone()
            if not fila:
                return self.error(404, "Ese punto ya no existe.")
            es_admin = bool(ADMIN_TOKEN) and hmac.compare_digest(token, ADMIN_TOKEN)
            es_autor = bool(clave) and bool(fila["clave_hash"]) and hmac.compare_digest(hash_clave(clave), fila["clave_hash"])
            if not (es_admin or es_autor):
                return self.error(403, "Solo se puede borrar un punto desde el teléfono que lo marcó.")
            con.execute("DELETE FROM puntos WHERE id = ?", (id_punto,))
        self.enviar(200, {"ok": True})


def main():
    iniciar_db()
    servidor = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mapa del cauce en http://{HOST}:{PORT}  centro={CENTRO} radio={RADIO_M:.0f} m  db={DB_PATH}", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
