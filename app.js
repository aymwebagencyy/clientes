// ====== CONFIGURACIÓN ======
const SUPABASE_URL = "https://ruysgaqpgixqntfrwlpn.supabase.co";
const SUPABASE_KEY = "sb_publishable_m1tzTA8xbAH272mvTh0-oQ_kgqlDs6D"; // clave pública (la seguridad la ponen las reglas de la base de datos)
const POR_SEMANA = 15;
const WEB_AYM = "https://aymwebagencyy.github.io";
// ===========================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });

const ESTADOS = {
  sin_llamar:["Sin llamar","#9C978C"], whatsapp_enviado:["WhatsApp enviado","#6FA3D8"], ig_enviado:["Instagram enviado","#6FA3D8"], tk_enviado:["TikTok enviado","#6FA3D8"], no_contesta:["No contesta","#E0A84F"],
  llamar_luego:["Volver a llamar","#E0A84F"], llamado:["Llamado","#6FA3D8"], enviado_socio:["Pasado al socio","#6FA3D8"],
  interesado:["Interesado","#5BB98B"], quiere_web:["Quiere la web","#5BB98B"], reunion:["Reunión / visita","#5BB98B"],
  presupuesto:["Presupuesto enviado","#C9A961"], en_proceso:["Haciendo su web","#C9A961"], cliente:["¡Cliente! Web entregada","#E8D4A0"],
  no_interesado:["No interesado","#D46A6A"], tiene_web:["Ya tiene web","#D46A6A"]
};
const SUGERENCIAS = ["Carabanchel","Usera","Latina","Puente de Vallecas","Villa de Vallecas","Arganzuela","Centro","Tetuán","Ciudad Lineal","Moratalaz","Vicálvaro","San Blas-Canillejas","Hortaleza","Fuencarral-El Pardo","Chamberí","Salamanca","Retiro","Chamartín","Moncloa-Aravaca","Barajas","Fuenlabrada","Móstoles","Alcorcón","Valdemoro","San Martín de la Vega","Ciempozuelos","Aranjuez","Torrejón de Ardoz","Alcalá de Henares","Rivas-Vaciamadrid","Arganda del Rey","Humanes de Madrid","Griñón","Navalcarnero","Majadahonda","Las Rozas de Madrid","Pozuelo de Alarcón","Boadilla del Monte","Collado Villalba","Coslada","San Fernando de Henares","Alcobendas","San Sebastián de los Reyes","Tres Cantos"];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const semana = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); };
const ahora = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function toast(t, ms = 2800) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, ms); }
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const S = { neg: new Map(), seg: new Map(), zon: new Map(), geo: new Map() };
let zona = "", sectorF = "", estF = "", buscando = false;
const POR_PAGINA = 24; let mostrar = POR_PAGINA;

// =================== ACCESO ===================
async function arranque() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const { data: ok } = await sb.rpc("acceso_ok");
    if (ok) return entrar(session);
  }
  mostrarLogin();
}
function mostrarLogin() {
  $("#app").hidden = true; $("#login").hidden = false;
  $("#lpin").focus();
}
$("#lform").onsubmit = async e => {
  e.preventDefault();
  const pin = $("#lpin").value.trim(), pin2 = $("#lpin2").value.trim();
  if (!pin || !pin2) return $("#lmsg").textContent = "Escribe los dos códigos.";
  $("#lok").disabled = true; $("#lmsg").textContent = "Comprobando…";
  try {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const r = await sb.auth.signInAnonymously();
      if (r.error) return $("#lmsg").textContent = "No se pudo conectar: " + r.error.message;
      session = r.data.session;
    }
    const { data, error } = await sb.rpc("verificar_pin", { pin, pin2 });
    if (error) return $("#lmsg").textContent = "Error: " + error.message;
    if (data === "ok") { $("#lmsg").textContent = ""; return entrar(session); }
    const msg = { incorrecto: "Algún código no es correcto.", bloqueado: "Demasiados intentos. Espera 15 minutos.", sin_sesion: "Vuelve a intentarlo." };
    $("#lmsg").textContent = msg[data] || data;
    if (data === "sin_sesion") await sb.auth.signOut();
  } finally { $("#lok").disabled = false; $("#lpin").value = ""; $("#lpin2").value = ""; }
};
$("#salir").onclick = async () => { await sb.auth.signOut(); location.reload(); };

// =================== DATOS ===================
async function cargar(tabla, map) {
  const { data, error } = await sb.from(tabla).select("id,data");
  if (error) throw error;
  map.clear(); data.forEach(r => map.set(r.id, r.data));
}
async function entrar(session) {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#quien").textContent = "";
  initMapa();
  try {
    await Promise.all([cargar("negocios", S.neg), cargar("seguimiento", S.seg), cargar("zonas", S.zon), cargar("geo", S.geo)]);
  } catch (e) { const n = $("#estado"); n.hidden = false; n.textContent = "No se pueden cargar los datos: " + e.message; return; }
  renderTodo(); dibujarZonas(); encuadrar();
  // cambios en directo (tu socio y tú a la vez)
  sb.channel("cambios")
    .on("postgres_changes", { event: "*", schema: "public", table: "seguimiento" }, p => { aplicar(S.seg, p); pintar(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "negocios" }, p => { aplicar(S.neg, p); pintar(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "zonas" }, p => { aplicar(S.zon, p); renderZonas(); dibujarZonas(); })
    .subscribe();
  setTimeout(automatico, 1500);
}
function aplicar(map, p) { if (p.eventType === "DELETE") map.delete(p.old.id); else map.set(p.new.id, p.new.data); }
async function guardar(tabla, id, data) {
  const { error } = await sb.from(tabla).upsert({ id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  ({ negocios: S.neg, seguimiento: S.seg, zonas: S.zon, geo: S.geo })[tabla].set(id, data);
}

const est = id => (S.seg.get(id) || {}).estado || "sin_llamar";
const zonasLista = () => [...S.zon.entries()].filter(([id]) => !id.startsWith("_")).map(([, z]) => z).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
function renderTodo() { renderStats(); renderHoy(); renderEscritos(); renderZonas(); dibujarNegocios(); renderGrid(); }

// =================== YA ESCRITOS ===================
const ESCRITOS = ["whatsapp_enviado", "ig_enviado", "tk_enviado"];
let verTodosEsc = false;
function ultimoEnvio(id) { return ((S.seg.get(id) || {}).historial || []).filter(h => /enviado/i.test(h.nota || "")).pop(); }
function renderEscritos() {
  const box = $("#escList"); if (!box) return;
  const lista = [...S.neg.values()].filter(n => !n.descartado && ESCRITOS.includes(est(n.id)))
    .map(n => ({ n, h: ultimoEnvio(n.id) || {} })).sort((a, b) => (b.h.fecha || "").localeCompare(a.h.fecha || ""));
  const dias = f => { if (!f) return ""; const d = Math.floor((Date.now() - new Date(f.replace(" ", "T"))) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
  $("#escInfo").innerHTML = `<b>${lista.length}</b> esperando respuesta`;
  const vis = verTodosEsc ? lista : lista.slice(0, 15);
  box.innerHTML = lista.length ? vis.map(({ n, h }) => {
    const canal = (ESTADOS[est(n.id)] || [""])[0].replace(" enviado", "");
    const viejo = h.fecha && (Date.now() - new Date(h.fecha.replace(" ", "T"))) > 3 * 864e5;
    return `<div class="hoyrow" data-id="${esc(n.id)}"><div class="hn"><b>${esc(n.nombre)}</b>
      <span class="meta">${esc(n.categoria)} · ${esc(n.zona)} · ${esc(canal)} ${esc(dias(h.fecha))}${h.por ? " por " + esc(h.por) : ""}${viejo ? ' · <span style="color:#E0A84F">sin respuesta, vuelve a escribirle</span>' : ""}</span></div>
      <div class="acts">
        <button class="btn sm solid eSi">✅ Ha contestado</button>
        ${movil(n) ? `<button class="btn sm eWa">💬 Otra vez</button>` : n.instagram ? `<button class="btn sm eIg">📸 Otra vez</button>` : n.tiktok ? `<button class="btn sm eTk">🎵 Otra vez</button>` : ""}
        ${n.telefono ? `<a class="btn sm" href="tel:${esc(n.telefono)}">☎ Llamar</a>` : ""}
        <button class="btn sm eNo">No le interesa</button>
      </div></div>`; }).join("")
      + (lista.length > vis.length ? `<button class="btn sm" id="escMas">Ver los ${lista.length} escritos</button>` : "")
    : `<div class="meta">Todavía no habéis escrito a nadie. Empieza por "Hoy toca".</div>`;
  const mas = $("#escMas"); if (mas) mas.onclick = () => { verTodosEsc = true; renderEscritos(); };
  box.querySelectorAll(".hoyrow").forEach(r => {
    const n = S.neg.get(r.dataset.id), on = (s, f) => { const e = r.querySelector(s); if (e) e.onclick = f; };
    const marcar = (estado, nota, txt) => guardarSeg(n.id, { estado }, nota).then(() => { toast(txt); pintar(); }).catch(e => toast("No se pudo: " + e.message));
    on(".eSi", () => marcar("interesado", "Ha contestado al mensaje", "¡Bien! Movido a Interesados"));
    on(".eNo", () => marcar("no_interesado", "No le interesa", "Marcado como no interesado"));
    on(".eWa", () => modalMsg(n, "wa")); on(".eIg", () => modalMsg(n, "ig")); on(".eTk", () => modalMsg(n, "tk"));
  });
}
let _pend = 0;  // junta varios cambios seguidos en un solo repintado
function pintar() { clearTimeout(_pend); _pend = setTimeout(renderTodo, 120); }

// =================== BÚSQUEDA DE NEGOCIOS ===================
async function buscarZona(nombre, cantidad = POR_SEMANA) {
  if (buscando) return toast("Espera, ya estoy buscando otra zona…");
  buscando = true; $("#progreso").textContent = `Buscando negocios sin web en ${nombre}…`;
  try {
    const ids = new Set(S.neg.keys());
    const nombres = new Set([...S.neg.values()].map(n => (n.nombre || "").toLowerCase() + "|" + (n.zona || "").toLowerCase()));
    const { geo, nuevos } = await Busqueda.buscar(nombre, cantidad, ids, nombres);
    const id = Busqueda.slug(nombre);
    if (nuevos.length) {
      const { error } = await sb.from("negocios").upsert(nuevos.map(n => ({ id: n.id, data: n })), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
      nuevos.forEach(n => S.neg.set(n.id, n));
    }
    await guardar("geo", id, geo);
    const prev = S.zon.get(id) || {};
    await guardar("zonas", id, { ...prev, nombre, activa: prev.activa ?? true, pendiente: false, ultima: ahora() });
    pintar(); dibujarZonas();
    toast(nuevos.length ? `${nombre}: ${nuevos.length} negocios nuevos` : `${nombre}: no hay más negocios nuevos sin web de estos tipos`, 4000);
    return nuevos.length;
  } catch (e) {
    toast("No se pudo buscar en " + nombre + ": " + e.message, 5000);
    const id = Busqueda.slug(nombre), prev = S.zon.get(id);
    if (!prev) await guardar("zonas", id, { nombre, activa: true, pendiente: true, pedida: ahora() }).catch(() => {});
    renderZonas();
    return -1;
  } finally { buscando = false; $("#progreso").textContent = ""; }
}
// Al abrir: zonas pendientes y la tanda semanal (15 por zona marcada, una vez por semana)
async function automatico() {
  const hace6h = new Date(Date.now() - 6 * 3600e3).toISOString();
  for (const z of zonasLista().filter(z => z.pendiente && !(z.intento > hace6h))) {
    const id = Busqueda.slug(z.nombre);
    await guardar("zonas", id, { ...S.zon.get(id), intento: new Date().toISOString() }).catch(() => {});
    await buscarZona(z.nombre);
  }
  const meta = S.zon.get("_semana") || {};
  if (!meta.ultima || meta.ultima <= semana()) {
    const activas = zonasLista().filter(z => z.activa);
    if (!activas.length) return;
    toast(`Actualización semanal: buscando ${POR_SEMANA} negocios nuevos en ${activas.length} zonas…`, 4000);
    for (const z of activas) await buscarZona(z.nombre);
    await guardar("zonas", "_semana", { ultima: new Date().toISOString().slice(0, 10) }).catch(() => {});
  }
}

// =================== RESUMEN ===================
function renderStats() {
  const all = [...S.neg.values()].filter(n => !n.descartado);
  const cnt = (...ks) => all.filter(n => ks.includes(est(n.id))).length;
  const items = [["", "Total", all.length], ["sin_llamar", "Sin llamar", cnt("sin_llamar")], ["escritos", "Ya escritos", cnt(...ESCRITOS)], ["no_contesta", "No contestan", cnt("no_contesta", "llamar_luego")],
    ["interes", "Interesados", cnt("interesado", "quiere_web", "reunion", "presupuesto")], ["en_proceso", "Haciendo su web", cnt("en_proceso")],
    ["cliente", "Clientes", cnt("cliente")], ["nuevos", "Nuevos 7 días", all.filter(n => n.anadido >= semana()).length]];
  $("#stats").innerHTML = items.map(([k, l, v]) => `<button class="stat ${estF === k && k ? "on" : ""}" data-k="${k}"><b>${v}</b><span>${l}</span></button>`).join("");
  $("#stats").querySelectorAll(".stat").forEach(b => b.onclick = () => { const k = b.dataset.k;
    if (k === "nuevos") $("#fNew").checked = !$("#fNew").checked; else { estF = estF === k ? "" : k; $("#fEstado").value = ""; }
    renderTodo(); });
}

// =================== ZONAS ===================
function renderZonas() {
  const zs = zonasLista();
  $("#zlist").innerHTML = zs.map(z => { const n = [...S.neg.values()].filter(x => x.zona === z.nombre && !x.descartado).length;
    return `<div class="z ${zona === z.nombre ? "on" : ""}" data-n="${esc(z.nombre)}"><input type="checkbox" ${z.activa ? "checked" : ""} aria-label="15 nuevos cada semana en ${esc(z.nombre)}">
      <b>${esc(z.nombre)}</b>${z.pendiente ? "<em>pendiente</em>" : ""}<small>${n}</small></div>`; }).join("") || `<div class="meta">Aún no hay zonas.</div>`;
  $("#zlist").querySelectorAll(".z").forEach(el => {
    const nombre = el.dataset.n, id = Busqueda.slug(nombre);
    el.querySelector("input").onclick = async e => { e.stopPropagation();
      await guardar("zonas", id, { ...S.zon.get(id), activa: e.target.checked }).catch(err => toast("No se pudo guardar: " + err.message));
      toast(e.target.checked ? `${nombre}: 15 nuevos cada semana` : `${nombre}: sin negocios nuevos cada semana`); dibujarZonas(); };
    el.onclick = () => { zona = zona === nombre ? "" : nombre; mostrar = POR_PAGINA; renderTodo(); dibujarZonas(); zona ? encuadrar(nombre) : encuadrar(); };
  });
  const usadas = new Set(zs.map(z => z.nombre));
  $("#sugerencias").innerHTML = SUGERENCIAS.filter(s => !usadas.has(s)).map(s => `<option value="${esc(s)}">`).join("");
}
$("#bz").onclick = () => { const v = $("#nz").value.trim(); if (!v) return toast("Escribe una zona"); $("#nz").value = ""; buscarZona(v); };
$("#nz").onkeydown = e => { if (e.key === "Enter") $("#bz").click(); };

// =================== MAPA ===================
let MAP, capaZonas, capaNeg;
function initMapa() {
  if (MAP) return;
  MAP = L.map("map", { zoomControl: true, preferCanvas: true }).setView([40.32, -3.72], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(MAP);
  capaZonas = L.layerGroup().addTo(MAP); capaNeg = L.layerGroup().addTo(MAP);
  MAP.on("click", e => elegirPunto(e.latlng));
  $("#legend").innerHTML = Object.values(ESTADOS).map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
}
function dibujarZonas() {
  if (!capaZonas) return; capaZonas.clearLayers();
  const activas = new Set(zonasLista().filter(z => z.activa).map(z => z.nombre));
  for (const g of S.geo.values()) {
    if (!g.geojson) continue;
    const on = activas.has(g.nombre), sel = zona === g.nombre;
    L.geoJSON(g.geojson, { style: { color: on ? "#B8923F" : "#777", weight: sel ? 4 : 2, dashArray: on ? null : "6 6", fillColor: "#C9A961", fillOpacity: sel ? .18 : on ? .08 : .03 } })
      .on("click", ev => { L.DomEvent.stopPropagation(ev); zona = zona === g.nombre ? "" : g.nombre; renderTodo(); dibujarZonas(); })
      .addTo(capaZonas);
    if (g.center) L.marker(g.center, { interactive: false, icon: L.divIcon({ className: "", html: `<span class="zlabel">${esc(g.nombre)}</span>`, iconSize: null }) }).addTo(capaZonas);
  }
}
function dibujarNegocios() {
  if (!capaNeg) return; capaNeg.clearLayers();
  visibles().filter(n => n.lat).forEach(n => {
    const [l, c] = ESTADOS[est(n.id)];
    L.circleMarker([n.lat, n.lon], { radius: 7, color: "#111", weight: 1.5, fillColor: c, fillOpacity: .95 })
      .bindPopup(`<b class="t">${esc(n.nombre)}</b><br>${esc(n.categoria)} · ${esc(n.zona)}<br>${n.telefono ? esc(n.telefono) + "<br>" : ""}<span style="color:${c}">● ${l}</span><br><button class="btn sm solid" data-ver="${esc(n.id)}" style="margin-top:6px">Ver ficha</button>`)
      .on("popupopen", ev => { const b = ev.popup.getElement().querySelector("[data-ver]"); if (b) b.onclick = () => verFicha(n.id); })
      .addTo(capaNeg);
  });
}
function encuadrar(nombreZona) {
  if (!MAP) return;
  const g = nombreZona && [...S.geo.values()].find(x => x.nombre === nombreZona);
  if (g?.geojson) return MAP.fitBounds(L.geoJSON(g.geojson).getBounds(), { padding: [20, 20] });
  const capas = [...S.geo.values()].filter(x => x.geojson).map(x => L.geoJSON(x.geojson));
  if (capas.length) MAP.fitBounds(L.featureGroup(capas).getBounds(), { padding: [20, 20] });
}
async function elegirPunto(ll) {
  const pop = L.popup().setLatLng(ll).setContent("Buscando qué zona es…").openOn(MAP);
  try {
    const ops = await Busqueda.quePunto(ll.lat, ll.lng);
    if (!ops.length) return pop.setContent("No reconozco esta zona");
    pop.setContent(`<b class="t">¿Qué zona quieres?</b>` + ops.map((o, i) => `<div style="margin-top:8px"><span class="meta">${esc(o.tipo)}</span><br><b>${esc(o.nombre)}</b><br>
      <button class="btn sm solid" data-i="${i}">${zonasLista().some(z => z.nombre === o.nombre) ? "Buscar " + POR_SEMANA + " más" : "Añadir y buscar " + POR_SEMANA}</button></div>`).join(""));
    pop.getElement().querySelectorAll("[data-i]").forEach(b => b.onclick = () => { MAP.closePopup(); buscarZona(ops[b.dataset.i].nombre); });
  } catch (e) { pop.setContent("Error: " + esc(e.message)); }
}
function verFicha(id) {
  MAP.closePopup();
  let c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!c) { zona = ""; sectorF = ""; estF = ""; $("#q").value = S.neg.get(id)?.nombre || ""; mostrar = POR_PAGINA; renderTodo(); c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); }
  c?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// =================== FILTROS ===================
$("#fEstado").innerHTML = `<option value="">Todos los estados</option>` + Object.entries(ESTADOS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join("");
document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { sectorF = b.dataset.s; mostrar = POR_PAGINA; document.querySelectorAll("[data-s]").forEach(x => x.classList.toggle("on", x === b)); renderTodo(); });
let _qT = 0;
["#q", "#fEstado", "#fTel", "#fNew", "#fDesc"].forEach(s => $(s).addEventListener("input", () => {
  if (s === "#fEstado") estF = "";
  clearTimeout(_qT); _qT = setTimeout(() => { mostrar = POR_PAGINA; dibujarNegocios(); renderGrid(); }, s === "#q" ? 300 : 0); }));
function visibles() {
  const q = $("#q").value.toLowerCase(), fe = $("#fEstado").value;
  const grupo = { interes: ["interesado", "quiere_web", "reunion", "presupuesto"], no_contesta: ["no_contesta", "llamar_luego"], escritos: ESCRITOS };
  return [...S.neg.values()].filter(n => ($("#fDesc").checked || !n.descartado)
    && (!zona || n.zona === zona) && (!sectorF || n.sector === sectorF)
    && (!fe || est(n.id) === fe) && (fe || !estF || (grupo[estF] || [estF]).includes(est(n.id)))
    && (!$("#fTel").checked || n.telefono) && (!$("#fNew").checked || n.anadido >= semana())
    && (!q || [n.nombre, n.categoria, n.direccion, n.zona, n.cocina, (S.seg.get(n.id) || {}).notas].join(" ").toLowerCase().includes(q)));
}

// =================== FICHAS ===================
const tel34 = t => { let n = String(t || "").replace(/\D/g, ""); if (n.length === 9) n = "34" + n; return n; };
function movil(n) { for (const t of [n.whatsapp, n.telefono]) { const d = tel34(t); if (/^34[67]\d{8}$/.test(d)) return d; } return ""; }
const si = v => v === "yes" ? "Sí" : v === "no" ? "No" : "";
function googleLinks(n) {
  const q = encodeURIComponent(`${n.nombre} ${n.direccion || n.zona}`), qz = encodeURIComponent(`${n.nombre} ${n.zona}`);
  return `<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Google Maps</a>`
    + `<a href="https://www.google.com/search?q=${qz}" target="_blank" rel="noopener">🔎 Google</a>`
    + `<a href="https://www.google.com/search?tbm=isch&q=${qz}" target="_blank" rel="noopener">🖼 Fotos</a>`
    + (n.lat ? `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${n.lat},${n.lon}" target="_blank" rel="noopener">🏪 Fachada</a>` : "")
    + `<a href="https://www.google.com/search?q=${encodeURIComponent(n.nombre + " " + n.zona + " instagram")}" target="_blank" rel="noopener">📸 Su Instagram</a>`;
}
function renderGrid() {
  if (!S.neg.size) { $("#grid").innerHTML = `<div class="empty">Todavía no hay negocios. Añade una zona a la derecha.</div>`; $("#count").textContent = ""; return; }
  const L2 = visibles().sort((a, b) => (b.anadido || "").localeCompare(a.anadido || "") || (b.prioridad || 0) - (a.prioridad || 0));
  $("#count").textContent = `${L2.length} negocios`;
  const vis = L2.slice(0, mostrar);
  $("#grid").innerHTML = L2.length ? vis.map(card).join("") + (L2.length > vis.length ? `<div class="empty"><button class="btn solid" id="verMas">Ver más (${L2.length - vis.length} restantes)</button></div>` : "")
    : `<div class="empty">No hay negocios con estos filtros.</div>`;
  const vm = $("#verMas"); if (vm) vm.onclick = () => { mostrar += POR_PAGINA; renderGrid(); };
  bind();
}
function card(n) {
  const s = S.seg.get(n.id) || {}, e = est(n.id), [el, ec] = ESTADOS[e];
  const fotos = n.fotos || [];
  const gal = fotos.length ? `<div class="gal">${fotos.map(f => `<img loading="lazy" src="${esc(f.url || f)}" alt="Foto de ${esc(n.nombre)}">`).join("")}</div>`
    : `<div class="nogal">Sin fotos todavía <button class="btn sm aUp">Subir fotos</button></div>`;
  const extras = [n.cocina && `Cocina: ${n.cocina}`, si(n.terraza) && `Terraza: ${si(n.terraza)}`, si(n.para_llevar) && `Para llevar: ${si(n.para_llevar)}`,
    si(n.domicilio) && `A domicilio: ${si(n.domicilio)}`, si(n.accesible) && `Accesible: ${si(n.accesible)}`].filter(Boolean);
  const redes = [n.instagram && `<a href="${esc(n.instagram)}" target="_blank" rel="noopener">Instagram</a>`, n.tiktok && `<a href="${esc(n.tiktok)}" target="_blank" rel="noopener">TikTok</a>`,
    n.facebook && `<a href="${esc(n.facebook)}" target="_blank" rel="noopener">Facebook</a>`].filter(Boolean);
  const opts = Object.entries(ESTADOS).map(([k, [l]]) => `<option value="${k}" ${k === e ? "selected" : ""}>${l}</option>`).join("");
  const hist = (s.historial || []).slice().reverse().map(h => `<div>${esc(h.fecha)} · <b>${esc((ESTADOS[h.estado] || [h.estado])[0])}</b>${h.por ? " · " + esc(h.por) : ""}${h.nota ? " — " + esc(h.nota) : ""}</div>`).join("");
  return `<article class="card ${n.descartado ? "desc" : ""}" data-id="${esc(n.id)}">
    ${gal}
    <div class="cb">
      <div class="top"><div><div class="name">${esc(n.nombre)}${n.anadido >= semana() ? '<span class="new">NUEVO</span>' : ""}</div>
        <div class="meta">${esc(n.categoria)} · ${esc(n.zona)} · añadido ${esc(n.anadido)}</div></div>
        <span class="badge" style="color:${ec};border-color:${ec}">${el}</span></div>
      <div class="row"><span class="k">Dirección</span><span class="v">${esc(n.direccion) || '<span class="meta">sin dirección</span>'}</span></div>
      <div class="row"><span class="k">Teléfono</span><span class="v">${n.telefono ? `<a href="tel:${esc(n.telefono)}"><b>${esc(n.telefono)}</b></a>` : '<span class="meta">no encontrado</span>'}</span></div>
      ${n.email ? `<div class="row"><span class="k">Email</span><span class="v">${esc(n.email)}</span></div>` : ""}
      ${n.horario ? `<div class="row"><span class="k">Horario</span><span class="v meta">${esc(n.horario)}</span></div>` : ""}
      ${n.descripcion ? `<div class="row"><span class="k">Descripción</span><span class="v meta">${esc(n.descripcion)}</span></div>` : ""}
      <div class="row"><span class="k">Google</span><span class="v">${resenasOk(n) === null ? '<span class="meta">reseñas sin mirar</span>' : `⭐ ${num1(n.valoracion)} · ${esc(n.resenas)} reseñas${resenasOk(n) ? "" : ' <span style="color:#D46A6A">(no llega al mínimo)</span>'}`}</span></div>
      <div class="row"><span class="k">Redes</span><span class="v tags">${redes.join("") || '<span>sin redes conocidas</span>'}</span></div>
      ${extras.length ? `<div class="tags">${extras.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="tags">${googleLinks(n)}</div>
      <div class="tags"><span>❌ Sin página web</span>${movil(n) ? `<span>📱 Móvil: admite WhatsApp</span>` : n.telefono ? `<span>☎ Teléfono fijo: mejor llamar</span>` : ""}</div>
    </div>
    <div class="crm">
      <select class="cEst" aria-label="Estado">${opts}</select>
      <input type="date" class="cProx" value="${esc(s.proxima)}" aria-label="Próxima llamada">
      <input class="cNota full" placeholder="Qué ha pasado en esta llamada">
      <textarea class="cNotas full" placeholder="Notas del negocio">${esc(s.notas)}</textarea>
      <div class="acts full">
        <button class="btn sm solid aSave">Guardar</button>
        ${movil(n) ? `<button class="btn sm solid aWa">💬 Mensaje WhatsApp</button>` : ""}
        ${n.instagram ? `<button class="btn sm solid aIg">📸 Mensaje Instagram</button>` : ""}
        ${n.tiktok ? `<button class="btn sm solid aTk">🎵 Mensaje TikTok</button>` : ""}
        <button class="btn sm aEdit">Completar datos</button>
        ${fotos.length ? `<button class="btn sm aUp">Subir fotos</button>` : ""}
        <button class="btn sm aCopy">Copiar ficha</button>
        <button class="btn sm aDesc">${n.descartado ? "Recuperar" : "Descartar"}</button>
      </div>
      ${s.por ? `<div class="meta full">Último cambio: ${esc(s.fecha || "")} por ${esc(s.por)}</div>` : ""}
      ${hist ? `<div class="hist full">${hist}</div>` : ""}
    </div></article>`;
}
function ficha(n) { const s = S.seg.get(n.id) || {};
  return [`*${n.nombre}*`, `${n.categoria} · ${n.zona}`, `Dirección: ${n.direccion || "-"}`, `Teléfono: ${n.telefono || "no encontrado"}`,
    n.horario && `Horario: ${n.horario}`, n.instagram && `Instagram: ${n.instagram}`, `Estado: ${ESTADOS[est(n.id)][0]}`, s.notas && `Notas: ${s.notas}`, `Sin página web`].filter(Boolean).join("\n"); }
async function copiar(t) { try { await navigator.clipboard.writeText(t); toast("Copiado"); } catch { toast("No se pudo copiar"); } }
const capital = s => String(s || "").toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
const firma = () => lsGet("aym_firma") || "";

async function guardarSeg(id, cambios, nota) {
  const prev = S.seg.get(id) || { historial: [] };
  const estado = cambios.estado || prev.estado || "sin_llamar";
  const doc = { ...prev, ...cambios, estado, fecha: ahora(), por: firma(),
    historial: [...(prev.historial || []), { fecha: ahora(), estado, por: firma(), nota: nota || "" }].slice(-50) };
  await guardar("seguimiento", id, doc);
}
let subirA = null;
function bind() {
  document.querySelectorAll(".card").forEach(c => {
    const id = c.dataset.id, n = S.neg.get(id); const on = (sel, fn) => { const el = c.querySelector(sel); if (el) el.onclick = fn; };
    on(".aCopy", () => copiar(ficha(n)));
    on(".aWa", () => modalWA(n)); on(".aIg", () => modalMsg(n, "ig")); on(".aTk", () => modalMsg(n, "tk"));
    on(".aSave", async () => {
      if (!firma()) { pedirNombre(() => c.querySelector(".aSave").click()); return; }
      try { await guardarSeg(id, { estado: c.querySelector(".cEst").value, notas: c.querySelector(".cNotas").value, proxima: c.querySelector(".cProx").value }, c.querySelector(".cNota").value.trim());
        toast("Guardado"); pintar(); } catch (e) { toast("No se pudo guardar: " + e.message); }
    });
    on(".aDesc", async () => { try { await guardar("negocios", id, { ...n, descartado: !n.descartado }); pintar(); } catch (e) { toast("No se pudo: " + e.message); } });
    c.querySelectorAll(".aUp").forEach(b => b.onclick = () => { subirA = id; $("#upl").click(); });
    on(".aEdit", () => editar(n));
    c.querySelectorAll(".gal img").forEach(img => img.onclick = () => { const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<img src="${esc(img.src)}" alt="">`; m.onclick = () => m.remove(); document.body.append(m); });
  });
}
$("#upl").onchange = async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length || !subirA) return;
  const n = S.neg.get(subirA); toast(`Subiendo ${files.length} foto(s)…`);
  try {
    const nuevas = [];
    for (const f of files) {
      const ruta = `${subirA}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await sb.storage.from("fotos").upload(ruta, f, { contentType: f.type });
      if (error) throw error;
      nuevas.push({ ruta, url: sb.storage.from("fotos").getPublicUrl(ruta).data.publicUrl });
    }
    await guardar("negocios", subirA, { ...n, fotos: [...(n.fotos || []), ...nuevas] }); toast("Fotos subidas"); pintar();
  } catch (err) { toast("No se pudieron subir: " + err.message); }
};
function pedirNombre(despues) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="box"><b style="font:400 18px Georgia;color:#E8D4A0">¿Quién eres?</b><div class="meta">Tu nombre aparece en el historial para que tu socio sepa quién llamó. Se guarda en este dispositivo.</div>
    <label for="qn">Tu nombre</label><input id="qn" required><div class="acts" style="justify-content:flex-end"><button class="btn solid">Guardar</button></div></form>`;
  document.body.append(m); m.querySelector("#qn").focus();
  m.querySelector("form").onsubmit = ev => { ev.preventDefault(); lsSet("aym_firma", capital(m.querySelector("#qn").value.trim())); m.remove(); $("#quien").textContent = firma(); despues && despues(); };
}
function editar(n) {
  const campos = [["telefono", "Teléfono"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["instagram", "Instagram (enlace o @usuario)"], ["tiktok", "TikTok (enlace o @usuario)"], ["facebook", "Facebook"], ["horario", "Horario"], ["direccion", "Dirección"], ["valoracion", "Estrellas en Google (ej. 4,6)"], ["resenas", "Nº de reseñas en Google"]];
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="box"><b style="font:400 18px Georgia;color:#E8D4A0">${esc(n.nombre)}</b>${campos.map(([k, l]) => `<label>${l}<input id="ed-${k}" name="${k}" value="${esc(n[k] || "")}"></label>`).join("")}
    <div class="acts" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn" id="edC">Cancelar</button><button class="btn solid">Guardar</button></div></form>`;
  document.body.append(m);
  m.querySelector("#edC").onclick = () => m.remove();
  m.querySelector("form").onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target), d = { ...n };
    campos.forEach(([k]) => { let v = String(f.get(k) || "").trim();
      if (v && k === "instagram" && !v.startsWith("http")) v = "https://instagram.com/" + v.replace(/^@/, "");
      if (v && k === "tiktok" && !v.startsWith("http")) v = "https://www.tiktok.com/@" + v.replace(/^@/, "");
      if (v && (k === "valoracion" || k === "resenas")) v = Number(v.replace(",", "."));
      if (v || v === 0) d[k] = v; else delete d[k]; });
    try { await guardar("negocios", n.id, d); m.remove(); toast("Datos guardados"); pintar(); } catch (e) { toast("No se pudo guardar: " + e.message); } };
}

// Mensaje de WhatsApp personalizado según el tipo de negocio
// ----- Mensajes personalizados: cercanos, cortos, que no suenen a plantilla -----
const RES_MIN = 20, EST_MIN = 4.0;   // minimo de reseñas y estrellas para "Hoy toca"
const elige = (n, arr) => arr[[...String(n.id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % arr.length];
const num1 = v => String(Math.round(Number(v) * 10) / 10).replace(".", ",");
function tipoDe(n) {
  const c = (n.categoria || "").toLowerCase();
  if (/kebab/.test(c)) return { t: "kebab", s: "comida" };
  if (/pizz/.test(c)) return { t: "pizzería", s: "comida" };
  if (/poller|asador/.test(c)) return { t: "pollo asado", s: "comida" };
  if (/hamburg|comida rápida|bocater/.test(c)) return { t: "comida para llevar", s: "comida" };
  if (/restaurante|tapas|sushi|marisquer/.test(c)) return { t: "restaurante", s: "restaurante" };
  if (/pasteler/.test(c)) return { t: "pastelería", s: "panaderia" };
  if (/panader/.test(c)) return { t: "panadería", s: "panaderia" };
  if (/fotograf/.test(c)) return { t: "fotógrafo", s: "foto" };
  if (/barber/.test(c)) return { t: "barbería", s: "pelo" };
  if (/peluquer/.test(c)) return { t: "peluquería", s: "pelo" };
  return { t: "negocio", s: "otro" };
}
function piezas(n) {
  const { t, s } = tipoDe(n), z = n.zona, nom = n.nombre;
  const buenas = Number(n.valoracion) >= EST_MIN && Number(n.resenas) >= RES_MIN;
  const elogio = buenas
    ? elige(n, [`Estuve mirando ${nom} en Google: un ${num1(n.valoracion)} con ${n.resenas} reseñas, se nota que lo hacéis bien 👏`,
                `Vi que ${nom} tiene un ${num1(n.valoracion)} en Google con ${n.resenas} opiniones. Eso no lo consigue cualquiera.`])
    : elige(n, [`Os encontré buscando ${t} en ${z} y me gustó lo que vi de ${nom}.`, `Estuve mirando negocios de ${z} y me fijé en ${nom}.`]);
  const necesidad = {
    comida: `Una cosa que veo mucho: alguien busca "${t} en ${z}" un viernes por la noche, entra en los que tienen web con la carta y los precios, y pide ahí. Los que no tienen web casi ni aparecen.`,
    restaurante: `La gente hoy mira el móvil antes de decidir dónde comer: carta, fotos, precio. Y si no lo encuentra, se va al de al lado aunque se coma peor 😅`,
    panaderia: `Cada vez más gente busca en el móvil "tartas por encargo" o "${t} cerca de mí", y los encargos se los llevan los que tienen web con fotos y WhatsApp.`,
    foto: `Antes de contratar a un fotógrafo, la gente quiere ver trabajos y precios en un sitio ordenado. En Instagram se pierde todo entre publicaciones, y en Google sin web casi no se sale.`,
    pelo: `Los que llegan nuevos al barrio buscan "${t} cerca de mí" y eligen por fotos y precios. Además, con una web te piden cita por WhatsApp y no tienes que coger el teléfono mientras cortas.`,
    otro: `Hoy casi todo el mundo busca en el móvil antes de ir a un sitio, y los que no tienen web se quedan fuera.`,
  }[s];
  const que = {
    comida: "la carta con precios, fotos, horario y un botón para pedir por WhatsApp", restaurante: "la carta, fotos de los platos, horario y reservas por WhatsApp",
    panaderia: "vuestros productos, encargos por WhatsApp y el horario", foto: "vuestro portfolio, los packs con precios y reservas de fecha",
    pelo: "vuestros trabajos, precios y cita por WhatsApp", otro: "vuestros servicios, fotos, horario y un botón de WhatsApp",
  }[s];
  return { elogio, necesidad, que };
}
function mensajeWA(n, yo) {
  const { elogio, necesidad, que } = piezas(n);
  const hola = elige(n, ["¡Hola! ¿Qué tal?", "Buenas, ¿qué tal va todo?", "¡Hola, buenas!"]) + (yo ? ` Soy ${yo}.` : "");
  return `${hola}\n\n${elogio}\n\n${necesidad}\n\n`
    + `Nosotros hacemos webs para negocios de la zona, sencillas y bonitas: ${que}. Lo hacemos todo nosotros, vosotros solo nos pasáis las fotos.\n\n`
    + elige(n, ["¿Te mando un ejemplo de cómo quedaría la vuestra? Si no te convence, ningún problema 🙂", "Si quieres te preparo un ejemplo de cómo quedaría la vuestra y lo ves sin compromiso. ¿Te parece?"])
    + `\n\n${yo ? yo + ", " : ""}AYM Web Agency`;
}
// Mensaje directo para Instagram / TikTok (más corto)
function mensajeDM(n, yo) {
  const { elogio, necesidad, que } = piezas(n);
  return `${elige(n, ["¡Hola! 👋", "¡Buenas! 🙂"])}${yo ? ` Soy ${yo}, de AYM Web Agency.` : " Te escribo de AYM Web Agency."}\n\n${elogio}\n\n${necesidad}\n\n`
    + `Hacemos webs para negocios del barrio con ${que}. ¿Os enseño un ejemplo de cómo quedaría la vuestra? Sin compromiso.\n\nWhatsApp 647 62 79 47`;
}
const CANALES = {
  wa: { nombre: "WhatsApp", estado: "whatsapp_enviado", boton: "Abrir WhatsApp" },
  ig: { nombre: "Instagram", estado: "ig_enviado", boton: "Copiar y abrir Instagram" },
  tk: { nombre: "TikTok", estado: "tk_enviado", boton: "Copiar y abrir TikTok" },
};
function modalWA(n) { modalMsg(n, "wa"); }
function modalMsg(n, canal) {
  const C = CANALES[canal], num = movil(n);
  const destino = canal === "wa" ? num : canal === "ig" ? n.instagram : n.tiktok;
  if (!destino) return toast(`Este negocio no tiene ${C.nombre}`);
  const gen = yo => canal === "wa" ? mensajeWA(n, yo) : mensajeDM(n, yo);
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box"><b style="font:400 18px Georgia;color:#E8D4A0">${C.nombre} a ${esc(n.nombre)}</b>
    <div class="meta">${canal === "wa" ? `Para +${esc(num)}` : esc(destino)} · ${esc(n.categoria)} · ${esc(n.zona)}. Puedes cambiar el texto antes de enviarlo.</div>
    ${canal === "wa" ? "" : `<div class="note" style="margin:0">Al pulsar el botón se copia el mensaje y se abre su perfil: pulsa <b>Mensaje</b>, mantén pulsado para <b>Pegar</b> y envía.</div>`}
    <label for="waYo">Firmar como (tu nombre)</label><input id="waYo" placeholder="Tu nombre">
    <label for="waTxt">Mensaje</label><textarea id="waTxt" rows="11"></textarea>
    <div class="acts" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn" id="waC">Cerrar</button><button type="button" class="btn" id="waCopy">Copiar texto</button>
      <a class="btn solid" id="waGo" target="_blank" rel="noopener">${C.boton}</a></div></div>`;
  document.body.append(m);
  const ta = m.querySelector("#waTxt"), go = m.querySelector("#waGo"), yo = m.querySelector("#waYo");
  yo.value = firma(); ta.value = gen(yo.value);
  const upd = () => { go.href = canal === "wa" ? `https://wa.me/${num}?text=${encodeURIComponent(ta.value)}` : destino; }; upd(); ta.oninput = upd;
  yo.oninput = () => { lsSet("aym_firma", capital(yo.value.trim())); ta.value = gen(yo.value.trim()); upd(); };
  m.querySelector("#waC").onclick = () => m.remove();
  m.querySelector("#waCopy").onclick = () => copiar(ta.value);
  go.addEventListener("click", async () => {
    if (canal !== "wa") { try { await navigator.clipboard.writeText(ta.value); } catch {} }
    m.remove();
    const prev = S.seg.get(n.id) || {}; const estado = (!prev.estado || ["sin_llamar", "whatsapp_enviado", "ig_enviado", "tk_enviado"].includes(prev.estado)) ? C.estado : prev.estado;
    try { await guardarSeg(n.id, { estado }, `Mensaje de ${C.nombre} enviado`); pintar(); toast(canal === "wa" ? "Marcado como WhatsApp enviado" : "Mensaje copiado: pégalo en su chat. Marcado como enviado"); }
    catch (e) { toast("No se pudo marcar: " + e.message); } });
}

// =================== HOY TOCA ===================
const POR_DIA = 10;
const hoyISO = () => ahora().slice(0, 10);
const saltados = () => { try { const o = JSON.parse(lsGet("aym_saltar") || "{}"); return o.dia === hoyISO() ? o.ids : []; } catch { return []; } };
function contactadoHoy(id) { return ((S.seg.get(id) || {}).historial || []).some(h => (h.fecha || "").startsWith(hoyISO()) && /enviado|llam/i.test(h.nota + " " + h.estado)); }
// true = cumple, false = no llega al mínimo, null = aún no lo sabemos
function resenasOk(n) {
  if (n.valoracion == null || n.resenas == null || n.valoracion === "" || n.resenas === "") return null;
  return Number(n.valoracion) >= EST_MIN && Number(n.resenas) >= RES_MIN;
}
function renderHoy() {
  const box = $("#hoyList"); if (!box) return;
  const todos = [...S.neg.values()].filter(n => !n.descartado);
  const hechos = todos.filter(n => contactadoHoy(n.id)).length;
  const skip = saltados();
  const canal = n => (movil(n) ? 4 : 0) + (n.instagram ? 2 : 0) + (n.tiktok ? 2 : 0) + (n.telefono ? 1 : 0);
  const quedan = Math.max(0, POR_DIA - hechos);
  const lista = todos.filter(n => est(n.id) === "sin_llamar" && !skip.includes(n.id) && resenasOk(n) !== false && (!zona || n.zona === zona) && (!sectorF || n.sector === sectorF))
    .sort((a, b) => (resenasOk(b) ? 1 : 0) - (resenasOk(a) ? 1 : 0) || canal(b) - canal(a) || (b.prioridad || 0) - (a.prioridad || 0) || a.id.localeCompare(b.id)).slice(0, quedan);
  $("#hoyInfo").innerHTML = `<b>${hechos}</b> de ${POR_DIA} contactados hoy` + (quedan ? "" : " · <b style='color:#5BB98B'>¡Objetivo de hoy cumplido!</b>");
  box.innerHTML = lista.length ? lista.map(n => {
    const q = encodeURIComponent(`${n.nombre} ${n.zona}`), maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.nombre + " " + (n.direccion || n.zona))}`;
    const cab = `<div class="hn"><b>${esc(n.nombre)}</b><span class="meta">${esc(n.categoria)} · ${esc(n.zona)}${n.telefono ? " · " + esc(n.telefono) : ""}${resenasOk(n) ? ` · ⭐ ${num1(n.valoracion)} (${esc(n.resenas)} reseñas)` : ""}</span></div>`;
    if (resenasOk(n) === null) return `<div class="hoyrow" data-id="${esc(n.id)}">${cab}
      <div class="acts"><a class="btn sm solid" target="_blank" rel="noopener" href="${maps}">⭐ Mirar reseñas en Maps</a>
        <input class="hEst" type="text" inputmode="decimal" placeholder="Estrellas" aria-label="Estrellas" style="width:96px">
        <input class="hRes" type="text" inputmode="numeric" placeholder="Nº reseñas" aria-label="Número de reseñas" style="width:110px">
        <button class="btn sm hRsave">Guardar</button><button class="btn sm hSkip">Saltar</button></div></div>`;
    return `<div class="hoyrow" data-id="${esc(n.id)}">${cab}
      <div class="acts">
        ${movil(n) ? `<button class="btn sm solid hWa">💬 WhatsApp</button>` : ""}
        ${n.instagram ? `<button class="btn sm solid hIg">📸 Instagram</button>` : `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}%20instagram">🔎 Buscar Instagram</a>`}
        ${n.tiktok ? `<button class="btn sm solid hTk">🎵 TikTok</button>` : `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}%20tiktok">🔎 Buscar TikTok</a>`}
        ${!movil(n) && n.telefono ? `<a class="btn sm solid hTel" href="tel:${esc(n.telefono)}">☎ Llamar</a>` : ""}
        <button class="btn sm hAdd">＋ Añadir redes</button>
        <button class="btn sm hSkip">Saltar</button>
      </div></div>`; }).join("")
    : `<div class="meta">${quedan ? "No quedan negocios con buenas reseñas sin contactar. Añade otra zona en el mapa." : "Mañana tendrás 10 más."}</div>`;
  box.querySelectorAll(".hoyrow").forEach(r => {
    const n = S.neg.get(r.dataset.id), on = (s, f) => { const e = r.querySelector(s); if (e) e.onclick = f; };
    on(".hWa", () => modalMsg(n, "wa")); on(".hIg", () => modalMsg(n, "ig")); on(".hTk", () => modalMsg(n, "tk"));
    on(".hAdd", () => editar(n));
    on(".hTel", () => setTimeout(() => guardarSeg(n.id, { estado: "llamado" }, "Llamado desde Hoy toca").then(pintar).catch(() => {}), 500));
    on(".hRsave", async () => {
      const e = parseFloat(String(r.querySelector(".hEst").value).replace(",", ".")), c = parseInt(r.querySelector(".hRes").value, 10);
      if (!(e >= 0 && e <= 5) || !(c >= 0)) return toast("Pon las estrellas (0 a 5) y el número de reseñas");
      try { await guardar("negocios", n.id, { ...n, valoracion: e, resenas: c });
        toast(e >= EST_MIN && c >= RES_MIN ? "¡Cumple! Ya puedes escribirle" : `Quitado: necesita ${num1(EST_MIN)}★ y ${RES_MIN} reseñas`); pintar(); }
      catch (err) { toast("No se pudo guardar: " + err.message); } });
    on(".hSkip", () => { lsSet("aym_saltar", JSON.stringify({ dia: hoyISO(), ids: [...saltados(), n.id] })); renderHoy(); });
  });
}

arranque();
