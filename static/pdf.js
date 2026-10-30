// Genera el PDF para la Municipalidad: mapa con los puntos numerados + tabla de descripciones.
// Se carga solo al tocar el botón; usa jsPDF y jspdf-autotable guardados en vendor/.
"use strict";

(function () {
  const COLOR = {
    rosa: [241, 125, 177], verde: [0, 178, 107], negro: [0, 0, 0],
    violeta: [105, 80, 161], naranja: [243, 112, 67], suave: [91, 84, 104], tinte: [245, 241, 250]
  };
  const ZOOM = 17;      // ~1,08 m por píxel en Asunción
  const TILE = 256;

  // --- utilidades ---------------------------------------------------------

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => mal(new Error("No se pudo cargar " + src));
      document.head.append(s);
    });
  }

  async function base64(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function proyectar(lat, lng, z) {
    const escala = TILE * Math.pow(2, z);
    const s = Math.sin(lat * Math.PI / 180);
    return {
      x: (lng + 180) / 360 * escala,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala
    };
  }

  function cargarImagen(url) {
    return new Promise((ok) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "strict-origin-when-cross-origin";  // OSM bloquea pedidos sin Referer
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = url;
    });
  }

  function urlTile(satelite, z, x, y) {
    return satelite
      ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
      : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }

  function rgb(c, a = 1) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  // --- mapa en canvas -------------------------------------------------------

  async function dibujarMapa({ centro, radio, puntos, satelite }) {
    // Canvas de tamaño fijo, así pines y textos salen siempre del mismo tamaño en la hoja.
    // Si el círculo (más un 12 % de margen) no entra a zoom 17, los tiles se achican.
    const LADO = 1240;
    const metrosPorPx17 = 156543.03392 * Math.cos(centro.lat * Math.PI / 180) / Math.pow(2, ZOOM);
    const f = Math.min(1, LADO / ((2 * radio * 1.12) / metrosPorPx17));
    const metrosPorPx = metrosPorPx17 / f;
    const tile = TILE * f;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = LADO;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e9e5ef";
    ctx.fillRect(0, 0, LADO, LADO);
    ctx.imageSmoothingQuality = "high";

    const c = proyectar(centro.lat, centro.lng, ZOOM);
    const ox = c.x * f - LADO / 2, oy = c.y * f - LADO / 2;
    const aPx = (lat, lng) => { const p = proyectar(lat, lng, ZOOM); return { x: p.x * f - ox, y: p.y * f - oy }; };

    // Fondo: tiles del mapa elegido en pantalla.
    const pedidos = [];
    for (let tx = Math.floor(ox / tile); tx <= Math.floor((ox + LADO) / tile); tx++) {
      for (let ty = Math.floor(oy / tile); ty <= Math.floor((oy + LADO) / tile); ty++) {
        pedidos.push(cargarImagen(urlTile(satelite, ZOOM, tx, ty)).then((img) => ({ img, tx, ty })));
      }
    }
    let faltantes = 0;
    for (const { img, tx, ty } of await Promise.all(pedidos)) {
      // +0.5 px de solape para que no se vean costuras entre tiles achicados.
      if (img) ctx.drawImage(img, tx * tile - ox, ty * tile - oy, tile + 0.5, tile + 0.5);
      else faltantes++;
    }

    // Área de trabajo: fuera del radio, oscurecido; borde punteado violeta.
    const rPx = radio / metrosPorPx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, LADO, LADO);
    ctx.arc(LADO / 2, LADO / 2, rPx, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.beginPath();
    ctx.arc(LADO / 2, LADO / 2, rPx, 0, Math.PI * 2);
    ctx.setLineDash([16, 12]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgb(COLOR.violeta);
    ctx.stroke();
    ctx.setLineDash([]);

    // Centro de la obra.
    etiqueta(ctx, LADO / 2, LADO / 2, "Obra MuCi");

    // Puntos: los de número más alto encima, igual que en la web.
    for (const p of [...puntos].sort((a, b) => a.id - b.id)) {
      const { x, y } = aPx(p.lat, p.lng);
      pin(ctx, x, y, String(p.id), p.estado === "limpiado" ? COLOR.verde : COLOR.naranja);
    }

    escalaYNorte(ctx, LADO, metrosPorPx);
    atribucion(ctx, LADO, satelite ? "Imágenes © Esri" : "© OpenStreetMap");
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), faltantes };
  }

  function etiqueta(ctx, x, y, texto) {
    ctx.font = "700 22px Poppins, sans-serif";
    const w = ctx.measureText(texto).width + 28, h = 36;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = rgb(COLOR.violeta);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, x, y + 1);
  }

  function pin(ctx, x, y, numero, color) {
    const r = 19, cy = y - r * 1.9;
    const a = Math.acos(r / (y - cy));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, cy, r, Math.PI / 2 + a, Math.PI / 2 - a);
    ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = rgb(color);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${numero.length > 2 ? 15 : 19}px Poppins, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(numero, x, cy + 1);
  }

  function escalaYNorte(ctx, lado, metrosPorPx) {
    const metros = 200, largo = metros / metrosPorPx;
    const x = 36, y = lado - 44;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 40, largo + 32, 64, 10);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, largo / 2, 8);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + largo / 2, y, largo / 2, 8);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, largo, 8);
    ctx.fillStyle = "#000";
    ctx.font = "600 18px Poppins, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText("0", x - 4, y - 10);
    ctx.textAlign = "center";
    ctx.fillText("100", x + largo / 2, y - 10);
    ctx.fillText(`${metros} m`, x + largo, y - 10);

    // Flecha norte (el mapa siempre está orientado al norte).
    const nx = lado - 56, ny = 70;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(nx, ny, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx, ny - 24);
    ctx.lineTo(nx + 12, ny + 8);
    ctx.lineTo(nx, ny + 2);
    ctx.lineTo(nx - 12, ny + 8);
    ctx.closePath();
    ctx.fillStyle = rgb(COLOR.violeta);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "700 16px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", nx, ny + 26);
  }

  function atribucion(ctx, lado, texto) {
    ctx.font = "500 15px Poppins, sans-serif";
    const w = ctx.measureText(texto).width + 16;
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillRect(lado - w, lado - 26, w, 26);
    ctx.fillStyle = "#333";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, lado - 8, lado - 13);
  }

  // --- PDF ------------------------------------------------------------------

  function bandaDegradada(doc, x, y, w, h) {
    const pasos = 80;
    for (let i = 0; i < pasos; i++) {
      const t = i / (pasos - 1);
      const c = COLOR.violeta.map((v, k) => Math.round(v + (COLOR.rosa[k] - v) * t));
      doc.setFillColor(...c);
      doc.rect(x + (w * i) / pasos, y, w / pasos + 0.3, h, "F");
    }
  }

  function fechaLarga(d) {
    return d.toLocaleString("es-PY", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function fechaCorta(iso) {
    return new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function generar({ cfg, puntos, satelite, tipos, cauces }) {
    if (!window.jspdf) {
      await cargarScript("vendor/jspdf.umd.min.js");
      await cargarScript("vendor/jspdf.plugin.autotable.min.js");
    }
    await Promise.all(["400", "600", "700"].map((w) => document.fonts.load(`${w} 20px Poppins`).catch(() => {})));
    const [regular, bold] = await Promise.all([
      base64("vendor/fonts/Poppins-Regular.ttf"), base64("vendor/fonts/Poppins-Bold.ttf")
    ]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    doc.addFileToVFS("Poppins-Regular.ttf", regular);
    doc.addFont("Poppins-Regular.ttf", "Poppins", "normal");
    doc.addFileToVFS("Poppins-Bold.ttf", bold);
    doc.addFont("Poppins-Bold.ttf", "Poppins", "bold");

    const W = 210, M = 15, ahora = new Date();
    const ordenados = [...puntos].sort((a, b) => a.id - b.id);

    // Encabezado
    bandaDegradada(doc, 0, 0, W, 34);
    doc.setTextColor(255, 255, 255);
    doc.setFont("Poppins", "bold");
    doc.setFontSize(19);
    doc.text("Puntos críticos de obstrucción", M, 15);
    doc.setFont("Poppins", "normal");
    doc.setFontSize(10.5);
    doc.text("Cauces Perú y Antequera · Costanera Norte, Asunción", M, 22.5);
    doc.setFontSize(8.5);
    doc.text(`Relevamiento al ${fechaLarga(ahora)}`, M, 28.5);

    // Resumen
    const cuenta = (c) => ordenados.filter((p) => p.cauce === c).length;
    const limpios = ordenados.filter((p) => p.estado === "limpiado").length;
    const resumen = [
      [String(ordenados.length - limpios), "pendientes", COLOR.naranja],
      [String(limpios), "limpiados", COLOR.verde],
      [String(cuenta("peru")), "cauce Perú", COLOR.violeta],
      [String(cuenta("antequera")), "cauce Antequera", COLOR.violeta],
      [String(cuenta("")), "sin cauce indicado", COLOR.violeta]
    ];
    const anchoCaja = (W - 2 * M - (resumen.length - 1) * 4) / resumen.length;
    resumen.forEach(([n, txt, color], i) => {
      const x = M + i * (anchoCaja + 4);
      doc.setFillColor(...COLOR.tinte);
      doc.roundedRect(x, 40, anchoCaja, 17, 2.5, 2.5, "F");
      doc.setFont("Poppins", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...color);
      doc.text(n, x + 4, 49);
      doc.setFont("Poppins", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR.suave);
      doc.text(txt, x + 4, 54);
    });

    // Mapa
    const { dataUrl, faltantes } = await dibujarMapa({ centro: cfg.centro, radio: cfg.radio, puntos: ordenados, satelite });
    const lado = W - 2 * M;
    doc.addImage(dataUrl, "JPEG", M, 62, lado, lado);
    doc.setDrawColor(...COLOR.violeta);
    doc.setLineWidth(0.4);
    doc.rect(M, 62, lado, lado);

    doc.setFont("Poppins", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.suave);
    const pie = `Círculo: radio de ${Math.round(cfg.radio)} m alrededor de la obra del MuCi (centro ${cfg.centro.lat.toFixed(5)}, ${cfg.centro.lng.toFixed(5)}). ` +
      "Naranja: pendiente de limpieza. Verde: ya limpiado. Cada número corresponde a una fila de la tabla de las páginas siguientes.";
    doc.text(doc.splitTextToSize(pie, lado), M, 62 + lado + 5);

    // Tabla
    doc.addPage();
    bandaDegradada(doc, 0, 0, W, 4);
    doc.setFont("Poppins", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLOR.negro);
    doc.text("Detalle de los puntos", M, 16);
    doc.setFont("Poppins", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.suave);
    doc.text("Las coordenadas son enlaces: abren cada punto en Google Maps.", M, 21.5);

    const filas = ordenados.map((p) => [
      String(p.id),
      (cauces[p.cauce] || "—").replace(/^Cauce /, ""),
      tipos[p.tipo] || "—",
      (p.descripcion || "Sin descripción") + (p.nota_limpieza ? `\nLimpieza: ${p.nota_limpieza}` : ""),
      `${p.lat.toFixed(5)}\n${p.lng.toFixed(5)}`,
      fechaCorta(p.creado),
      p.estado === "limpiado" ? `Limpiado\n${fechaCorta(p.limpiado)}` : "Pendiente"
    ]);

    doc.autoTable({
      startY: 26,
      margin: { left: M, right: M, bottom: 18 },
      head: [["N°", "Cauce", "Tipo", "Descripción", "Ubicación", "Fecha", "Estado"]],
      body: filas.length ? filas : [["", "", "", "Todavía no hay puntos marcados.", "", "", ""]],
      styles: { font: "Poppins", fontStyle: "normal", fontSize: 8.5, cellPadding: 2.2, textColor: COLOR.negro, lineColor: [231, 226, 239], lineWidth: 0.2, valign: "top" },
      headStyles: { font: "Poppins", fontStyle: "bold", fillColor: COLOR.violeta, textColor: [255, 255, 255], fontSize: 8.5 },
      alternateRowStyles: { fillColor: COLOR.tinte },
      columnStyles: {
        0: { cellWidth: 11, halign: "center", fontStyle: "bold", textColor: COLOR.naranja, fontSize: 10 },
        1: { cellWidth: 21 },
        2: { cellWidth: 22 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 21, textColor: COLOR.violeta, fontSize: 7.5 },
        5: { cellWidth: 21, fontSize: 7.5, textColor: COLOR.suave },
        6: { cellWidth: 22, fontSize: 7.5, fontStyle: "bold" }
      },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 6 && ordenados[d.row.index]) {
          d.cell.styles.textColor = ordenados[d.row.index].estado === "limpiado" ? [0, 122, 73] : COLOR.naranja;
        }
      },
      didDrawCell: (d) => {
        if (d.section === "body" && d.column.index === 4 && ordenados[d.row.index]) {
          const p = ordenados[d.row.index];
          doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: `https://www.google.com/maps?q=${p.lat},${p.lng}` });
        }
      }
    });

    // Pie de página en todas las hojas
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("Poppins", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR.suave);
      doc.text("Mapa del Cauce · Museo de Ciencias (MuCi)", M, 289);
      doc.text(`Página ${i} de ${total}`, W - M, 289, { align: "right" });
    }

    const nombre = `puntos-criticos-cauce-${ahora.toISOString().slice(0, 10)}.pdf`;
    return { blob: doc.output("blob"), nombre, faltantes };
  }

  window.generarPDF = generar;
})();
