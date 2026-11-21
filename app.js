// ====== CONFIGURACIÓN ======
const SUPABASE_URL = "https://ruysgaqpgixqntfrwlpn.supabase.co";
const SUPABASE_KEY = "sb_publishable_m1tzTA8xbAH272mvTh0-oQ_kgqlDs6D"; // clave pública (la seguridad la ponen las reglas de la base de datos)
const POR_SEMANA = 15;
const WEB_AYM = "https://aymwebagencyy.github.io";
// ===========================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });

const ESTADOS = {
  sin_llamar:["Sin llamar","#9C978C"], whatsapp_enviado:["WhatsApp enviado","#6FA3D8"], no_contesta:["No contesta","#E0A84F"],
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

// =================== ACCESO ===================
async function arranque() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarLogin(1);
  const { data: ok } = await sb.rpc("acceso_ok");
  if (ok) return entrar(session);
  mostrarLogin(2);
}
function mostrarLogin(paso) {
  $("#app").hidden = true; $("#login").hidden = false;
  $("#paso1").hidden = paso !== 1; $("#paso2").hidden = paso !== 2;
  (paso === 1 ? $("#lemail") : $("#lpin")).focus();
}
$("#lsend").onclick = async () => {
  const email = $("#lemail").value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return $("#lmsg").textContent = "Escribe un email válido.";
  $("#lsend").disabled = true; $("#lmsg").textContent = "Enviando…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $("#lsend").disabled = false;
  $("#lmsg").textContent = error ? "No se pudo enviar: " + error.message : "Listo. Abre el email que te hemos enviado y pulsa el enlace para entrar.";
};
$("#lemail").onkeydown = e => { if (e.key === "Enter") $("#lsend").click(); };
$("#lpinok").onclick = async () => {
  const pin = $("#lpin").value.trim(); if (!pin) return;
  $("#lpinok").disabled = true;
  const { data, error } = await sb.rpc("verificar_pin", { pin });
  $("#lpinok").disabled = false; $("#lpin").value = "";
  const msg = { ok: "", incorrecto: "Código incorrecto.", bloqueado: "Demasiados intentos. Espera 15 minutos.", no_permitido: "Este email no tiene acceso.", sin_sesion: "La sesión ha caducado: vuelve a pedir el enlace." };
  if (error) return $("#lpinmsg").textContent = "Error: " + error.message;
  if (data === "ok") { const { data: { session } } = await sb.auth.getSession(); return entrar(session); }
  $("#lpinmsg").textContent = msg[data] || data;
  if (data === "no_permitido" || data === "sin_sesion") { await sb.auth.signOut(); mostrarLogin(1); }
};
$("#lpin").onkeydown = e => { if (e.key === "Enter") $("#lpinok").click(); };
$("#lsalir1").onclick = async () => { await sb.auth.signOut(); mostrarLogin(1); };
$("#salir").onclick = async () => { await sb.auth.signOut(); location.reload(); };

// =================== DATOS ===================
async function cargar(tabla, map) {
  const { data, error } = await sb.from(tabla).select("id,data");
  if (error) throw error;
  map.clear(); data.forEach(r => map.set(r.id, r.data));
}
async function entrar(session) {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#quien").textContent = session?.user?.email || "";
  initMapa();
  try {
    await Promise.all([cargar("negocios", S.neg), cargar("seguimiento", S.seg), cargar("zonas", S.zon), cargar("geo", S.geo)]);
  } catch (e) { const n = $("#estado"); n.hidden = false; n.textContent = "No se pueden cargar los datos: " + e.message; return; }
  renderTodo(); dibujarZonas(); encuadrar();
  // cambios en directo (tu socio y tú a la vez)
  sb.channel("cambios")
    .on("postgres_changes", { event: "*", schema: "public", table: "seguimiento" }, p => { aplicar(S.seg, p); renderTodo(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "negocios" }, p => { aplicar(S.neg, p); renderTodo(); })
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
function renderTodo() { renderStats(); renderZonas(); dibujarNegocios(); renderGrid(); }

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
    renderTodo(); dibujarZonas();
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
  for (const z of zonasLista().filter(z => z.pendiente)) await buscarZona(z.nombre);
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
  const items = [["", "Total", all.length], ["sin_llamar", "Sin llamar", cnt("sin_llamar")], ["no_contesta", "No contestan", cnt("no_contesta", "llamar_luego")],
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
    el.onclick = () => { zona = zona === nombre ? "" : nombre; renderTodo(); dibujarZonas(); zona ? encuadrar(nombre) : encuadrar(); };
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
  MAP = L.map("map", { zoomControl: true }).setView([40.32, -3.72], 11);
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
  if (!c) { zona = ""; sectorF = ""; estF = ""; $("#q").value = S.neg.get(id)?.nombre || ""; renderTodo(); c = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); }
  c?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// =================== FILTROS ===================
$("#fEstado").innerHTML = `<option value="">Todos los estados</option>` + Object.entries(ESTADOS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join("");
document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { sectorF = b.dataset.s; document.querySelectorAll("[data-s]").forEach(x => x.classList.toggle("on", x === b)); renderTodo(); });
["#q", "#fEstado", "#fTel", "#fNew", "#fDesc"].forEach(s => $(s).addEventListener("input", () => { if (s === "#fEstado") estF = ""; dibujarNegocios(); renderGrid(); }));
function visibles() {
  const q = $("#q").value.toLowerCase(), fe = $("#fEstado").value;
  const grupo = { interes: ["interesado", "quiere_web", "reunion", "presupuesto"], no_contesta: ["no_contesta", "llamar_luego"] };
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
  $("#grid").innerHTML = L2.length ? L2.map(card).join("") : `<div class="empty">No hay negocios con estos filtros.</div>`;
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
    on(".aWa", () => modalWA(n));
    on(".aSave", async () => {
      if (!firma()) { pedirNombre(() => c.querySelector(".aSave").click()); return; }
      try { await guardarSeg(id, { estado: c.querySelector(".cEst").value, notas: c.querySelector(".cNotas").value, proxima: c.querySelector(".cProx").value }, c.querySelector(".cNota").value.trim());
        toast("Guardado"); renderTodo(); } catch (e) { toast("No se pudo guardar: " + e.message); }
    });
    on(".aDesc", async () => { try { await guardar("negocios", id, { ...n, descartado: !n.descartado }); renderTodo(); } catch (e) { toast("No se pudo: " + e.message); } });
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
    await guardar("negocios", subirA, { ...n, fotos: [...(n.fotos || []), ...nuevas] }); toast("Fotos subidas"); renderTodo();
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
  const campos = [["telefono", "Teléfono"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["instagram", "Instagram (enlace o @usuario)"], ["tiktok", "TikTok (enlace o @usuario)"], ["facebook", "Facebook"], ["horario", "Horario"], ["direccion", "Dirección"]];
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="box"><b style="font:400 18px Georgia;color:#E8D4A0">${esc(n.nombre)}</b>${campos.map(([k, l]) => `<label>${l}<input id="ed-${k}" name="${k}" value="${esc(n[k] || "")}"></label>`).join("")}
    <div class="acts" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn" id="edC">Cancelar</button><button class="btn solid">Guardar</button></div></form>`;
  document.body.append(m);
  m.querySelector("#edC").onclick = () => m.remove();
  m.querySelector("form").onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target), d = { ...n };
    campos.forEach(([k]) => { let v = String(f.get(k) || "").trim();
      if (v && k === "instagram" && !v.startsWith("http")) v = "https://instagram.com/" + v.replace(/^@/, "");
      if (v && k === "tiktok" && !v.startsWith("http")) v = "https://www.tiktok.com/@" + v.replace(/^@/, "");
      if (v) d[k] = v; else delete d[k]; });
    try { await guardar("negocios", n.id, d); m.remove(); toast("Datos guardados"); renderTodo(); } catch (e) { toast("No se pudo guardar: " + e.message); } };
}

// Mensaje de WhatsApp personalizado según el tipo de negocio
function mensajeWA(n, yo) {
  const c = (n.categoria || "").toLowerCase(), z = n.zona, nom = n.nombre;
  const hola = `Hola, ¿qué tal? ${yo ? `Soy ${yo}, de` : "Os escribo de"} AYM Web Agency, hacemos páginas web para negocios de la zona sur de Madrid.`;
  const cierre = `Te dejo lo que hacemos: ${WEB_AYM}\n¿Te parece si te enseño un ejemplo de cómo quedaría la vuestra? Sin ningún compromiso. ¡Gracias!`;
  let cuerpo;
  if (/kebab|pizz|hamburg|comida rápida|bocater|poller|asador/.test(c)) cuerpo = `He visto ${nom} en ${z} y me he dado cuenta de que todavía no tenéis página web. Mucha gente busca en Google "${c.split(" /")[0]} cerca de mí" antes de pedir. Con una web sencilla saldríais ahí, con vuestra carta, precios, horario y un botón para pedir para llevar o a domicilio por WhatsApp.`;
  else if (/restaurante|tapas|sushi|marisquer/.test(c)) cuerpo = `He visto ${nom} en ${z} y me ha llamado la atención que todavía no tenéis página web. Hoy casi todo el mundo mira en Google dónde comer antes de salir de casa. Con una web vuestra carta, fotos de los platos, horario y un botón para reservar por WhatsApp os encontrarían mucho más fácil.`;
  else if (/panader|pasteler/.test(c)) cuerpo = `He visto ${nom} en ${z} y aún no tenéis página web. Con una web los vecinos verían vuestros productos, el horario y podrían haceros encargos (tartas, pan, bandejas para eventos) directamente por WhatsApp.`;
  else if (/fotograf/.test(c)) cuerpo = `He visto ${nom} en ${z} y aún no tenéis página web. Antes de contratar una sesión, lo primero que mira un cliente es el portfolio. Con una web elegante se verían vuestros trabajos, los precios de las sesiones y podrían reservar fecha por WhatsApp.`;
  else if (/barber/.test(c)) cuerpo = `He visto ${nom} en ${z} y aún no tenéis página web. Con una web vuestros clientes verían los cortes, los precios y podrían pedir cita por WhatsApp a cualquier hora, y los que buscan "barbería cerca de mí" en Google os encontrarían.`;
  else if (/peluquer/.test(c)) cuerpo = `He visto ${nom} en ${z} y aún no tenéis página web. Con una web vuestras clientas verían los servicios, los precios y podrían pedir cita por WhatsApp a cualquier hora, y las que buscan "peluquería cerca de mí" en Google os encontrarían.`;
  else cuerpo = `He visto ${nom} en ${z} y aún no tenéis página web. Con una web os encontrarían en Google y los clientes os podrían escribir por WhatsApp con un solo toque.`;
  return `${hola}\n\n${cuerpo}\n\n${cierre}`;
}
function modalWA(n) {
  const num = movil(n); if (!num) return toast("Este negocio no tiene móvil");
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box"><b style="font:400 18px Georgia;color:#E8D4A0">WhatsApp a ${esc(n.nombre)}</b>
    <div class="meta">Para +${esc(num)} · ${esc(n.categoria)} · ${esc(n.zona)}. Puedes cambiar el texto antes de enviarlo.</div>
    <label for="waYo">Firmar como (tu nombre)</label><input id="waYo" placeholder="Tu nombre">
    <label for="waTxt">Mensaje</label><textarea id="waTxt" rows="12"></textarea>
    <div class="acts" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn" id="waC">Cerrar</button><button type="button" class="btn" id="waCopy">Copiar texto</button>
      <a class="btn solid" id="waGo" target="_blank" rel="noopener">Abrir WhatsApp</a></div></div>`;
  document.body.append(m);
  const ta = m.querySelector("#waTxt"), go = m.querySelector("#waGo"), yo = m.querySelector("#waYo");
  yo.value = firma(); ta.value = mensajeWA(n, yo.value);
  const upd = () => { go.href = `https://wa.me/${num}?text=${encodeURIComponent(ta.value)}`; }; upd(); ta.oninput = upd;
  yo.oninput = () => { lsSet("aym_firma", capital(yo.value.trim())); ta.value = mensajeWA(n, yo.value.trim()); upd(); };
  m.querySelector("#waC").onclick = () => m.remove();
  m.querySelector("#waCopy").onclick = () => copiar(ta.value);
  go.addEventListener("click", async () => { m.remove();
    const prev = S.seg.get(n.id) || {}; const estado = (!prev.estado || prev.estado === "sin_llamar") ? "whatsapp_enviado" : prev.estado;
    try { await guardarSeg(n.id, { estado }, "Mensaje de WhatsApp enviado"); renderTodo(); toast("Marcado como WhatsApp enviado"); } catch (e) { toast("No se pudo marcar: " + e.message); } });
}

arranque();
