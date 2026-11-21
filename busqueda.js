// Busqueda de negocios SIN web en una zona de Madrid, directamente desde el navegador
// (OpenStreetMap: Nominatim para la zona + Overpass para los negocios).
const Busqueda = (() => {
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];
  const COCINAS = {kebab:"Kebab",pizza:"Pizzería",burger:"Hamburguesería",chicken:"Pollería / asador",chinese:"Restaurante chino",
    spanish:"Restaurante español",regional:"Restaurante español",tapas:"Bar de tapas",italian:"Restaurante italiano",mexican:"Restaurante mexicano",
    japanese:"Restaurante japonés",sushi:"Sushi",asian:"Restaurante asiático",indian:"Restaurante indio",seafood:"Marisquería",sandwich:"Bocatería",
    latin_american:"Restaurante latino",peruvian:"Restaurante peruano",ecuadorian:"Restaurante ecuatoriano",colombian:"Restaurante colombiano",
    arab:"Restaurante árabe",turkish:"Restaurante turco",grill:"Asador"};
  const SECTORES = {Comida:["Restaurante","Comida rápida","Kebab","Pizzería","Hamburguesería","Pollería / asador","Bar de tapas","Bocatería","Asador","Sushi","Marisquería"],
    "Panadería":["Panadería","Pastelería"],"Fotografía":["Estudio de fotografía"],"Peluquería":["Peluquería","Barbería"]};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hoy = () => new Date().toISOString().slice(0, 10);
  const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  function categoria(t) {
    const n = (t.name || "").toLowerCase();
    if (t.amenity === "restaurant" || t.amenity === "fast_food") {
      for (const c of (t.cuisine || "").split(";")) if (COCINAS[c.trim()]) return COCINAS[c.trim()];
      if (/poll|asador/.test(n)) return "Pollería / asador";
      if (/kebab|d[öo]ner/.test(n)) return "Kebab";
      if (/pizz/.test(n)) return "Pizzería";
      return t.amenity === "fast_food" ? "Comida rápida" : "Restaurante";
    }
    if (t.shop === "butcher") return "Pollería / asador";
    if (t.shop === "bakery") return "Panadería";
    if (t.shop === "pastry") return "Pastelería";
    if (t.shop === "hairdresser" || t.shop === "barber") return (/barber/.test(n) || t.shop === "barber" || t.male === "yes") ? "Barbería" : "Peluquería";
    if (t.shop === "photo" || t.shop === "photo_studio" || t.craft === "photographer") return "Estudio de fotografía";
    return "Otro";
  }
  function sector(cat) {
    for (const [s, cats] of Object.entries(SECTORES)) if (cats.includes(cat) || (s === "Comida" && cat.startsWith("Restaurante"))) return s;
    return "";
  }

  // Zona: contorno y centro (Nominatim)
  async function zona(nombre) {
    const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
      q: `${nombre}, Comunidad de Madrid, España`, format: "json", limit: 5, polygon_geojson: 1, polygon_threshold: 0.0003, "accept-language": "es"});
    const r = await fetch(url);
    if (!r.ok) throw new Error("El buscador de zonas no responde");
    const res = (await r.json()).find(x => x.osm_type === "relation");
    if (!res) throw new Error(`No encuentro "${nombre}" en la Comunidad de Madrid`);
    return { areaId: 3600000000 + Number(res.osm_id), center: [Number(res.lat), Number(res.lon)], geojson: res.geojson };
  }

  // Que zona hay en un punto del mapa
  async function quePunto(lat, lon) {
    const url = "https://nominatim.openstreetmap.org/reverse?" + new URLSearchParams({lat, lon, format: "jsonv2", zoom: 15, addressdetails: 1, "accept-language": "es"});
    const a = (await (await fetch(url)).json()).address || {};
    const muni = a.city || a.town || a.village || "", dist = a.city_district || a.borough || "", barrio = a.suburb || a.quarter || a.neighbourhood || "";
    const out = [];
    if (barrio && barrio !== dist) out.push({ nombre: `${barrio}, ${dist || muni}`, tipo: dist ? "Barrio" : "Barrio / distrito" });
    if (dist) out.push({ nombre: dist, tipo: muni === "Madrid" ? "Distrito de Madrid" : "Distrito" });
    if (muni) out.push({ nombre: muni, tipo: "Municipio" });
    return out;
  }

  async function overpass(q) {
    let ultimo = "";
    for (const u of OVERPASS) {
      try {
        const r = await fetch(u, { method: "POST", body: new URLSearchParams({ data: q }) });
        if (r.ok) return (await r.json()).elements;
        ultimo = r.status;
      } catch (e) { ultimo = e.message; }
      await sleep(1500);
    }
    throw new Error("Los servidores de mapas están saturados (" + ultimo + "). Prueba en unos minutos.");
  }

  function query(aid) {
    const sw = '["name"][!"website"][!"contact:website"][!"url"][!"brand"][!"brand:wikidata"]';
    return `[out:json][timeout:90];area(${aid})->.a;(
      nwr(area.a)["amenity"~"^(restaurant|fast_food)$"]${sw};
      nwr(area.a)["shop"~"^(bakery|pastry|hairdresser|barber|photo|photo_studio)$"]${sw};
      nwr(area.a)["shop"="butcher"]["butcher"="poultry"]${sw};
      nwr(area.a)["craft"="photographer"]${sw};
    );out center tags;`;
  }

  function ficha(el, zonaNombre) {
    const t = el.tags || {};
    const cat = categoria(t);
    const calle = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
    const dir = [calle, t["addr:postcode"], t["addr:city"] || zonaNombre].filter(Boolean).join(", ");
    let ig = t["contact:instagram"] || t.instagram || ""; if (ig && !ig.startsWith("http")) ig = "https://instagram.com/" + ig.replace(/^@/, "");
    let tk = t["contact:tiktok"] || t.tiktok || ""; if (tk && !tk.startsWith("http")) tk = "https://www.tiktok.com/@" + tk.replace(/^@/, "");
    const n = {
      id: `osm-${el.type}-${el.id}`, nombre: (t.name || "").trim(), categoria: cat, sector: sector(cat), zona: zonaNombre, direccion: dir,
      telefono: t.phone || t["contact:phone"] || t["contact:mobile"] || "", whatsapp: t["contact:whatsapp"] || "",
      email: t.email || t["contact:email"] || "", instagram: ig, tiktok: tk, facebook: t["contact:facebook"] || t.facebook || "",
      horario: t.opening_hours || "", cocina: (t.cuisine || "").replace(/;/g, ", ").replace(/_/g, " "), descripcion: t.description || "",
      accesible: t.wheelchair || "", terraza: t.outdoor_seating || "", para_llevar: t.takeaway || "", domicilio: t.delivery || "",
      lat: el.lat ?? el.center?.lat, lon: el.lon ?? el.center?.lon, fotos: [], fuente: "OpenStreetMap", anadido: hoy(),
    };
    n.prioridad = (n.telefono ? 5 : 0) + ((n.instagram || n.tiktok || n.facebook) ? 2 : 0) + (calle ? 1 : 0) + (n.horario ? 1 : 0);
    for (const k of Object.keys(n)) if (n[k] === "" || n[k] == null) delete n[k];
    n.fotos = [];
    return n;
  }

  // Devuelve {geo, nuevos[]} con hasta "cantidad" negocios que no esten en "existentes" (Set de ids) ni repitan nombre
  async function buscar(zonaNombre, cantidad, existentes, nombresExistentes) {
    const z = await zona(zonaNombre);
    const els = await overpass(query(z.areaId));
    const vistos = new Set();
    const cand = els.map(e => ficha(e, zonaNombre)).filter(n => n.nombre && n.categoria !== "Otro" && !existentes.has(n.id))
      .sort((a, b) => b.prioridad - a.prioridad);
    const nuevos = [];
    for (const n of cand) {
      const k = n.nombre.toLowerCase();
      if (vistos.has(k) || nombresExistentes.has(k + "|" + zonaNombre.toLowerCase())) continue;
      vistos.add(k); nuevos.push(n);
      if (nuevos.length >= cantidad) break;
    }
    return { geo: { nombre: zonaNombre, center: z.center, geojson: z.geojson }, nuevos };
  }

  return { buscar, quePunto, slug };
})();
