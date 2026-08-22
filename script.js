const COLOMBIA_CENTER = [4.5709, -74.2973];
const map = L.map('map', { zoomControl: false }).setView(COLOMBIA_CENTER, 7);
navigator.geolocation?.getCurrentPosition(
  pos => map.flyTo([pos.coords.latitude, pos.coords.longitude], 12),
  () => {},
  { timeout: 5000 }
);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  maxZoom: 20
}).addTo(map);

let points = [];        // {id, marker, label}
let nextId = 1;
let pending = null;      // id of the point waiting for its pair
let editing = null;      // id of the point currently being renamed inline
let measurements = [];   // {id, aId, bId}
let nextMeasureId = 1;
let measureLayers = [];  // leaflet layers currently drawn for measurements
const PALETTE = ['#f43f5e', '#f97316', '#0ea5e9', '#8b5cf6', '#22c55e', '#eab308'];
const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function pointIcon(isPending) {
  return L.divIcon({ className: '', html: `<div class="pt-icon${isPending ? ' pending' : ''}"></div>`, iconSize: [12, 12] });
}

function handlePointClick(id) {
  if (pending === id) {
    pending = null;
  } else if (pending === null) {
    pending = id;
  } else {
    measurements.push({ id: nextMeasureId++, aId: pending, bId: id });
    pending = null;
  }
  refresh();
}

// Creates a point without opening the rename field — used for GeoJSON import.
function createPoint(lat, lng, label, id) {
  const pointId = id ?? nextId++;
  nextId = Math.max(nextId, pointId + 1);
  const marker = L.marker([lat, lng], { icon: pointIcon(false) }).addTo(map);
  marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8], className: 'point-label' });
  marker.on('click', () => handlePointClick(pointId));
  points.push({ id: pointId, marker, label });
  return pointId;
}

// Creates a point and immediately opens its label for inline editing.
function addPoint(lat, lng, defaultLabel) {
  const id = createPoint(lat, lng, defaultLabel);
  editing = id;
  refresh();
}

function commitRename(p, value) {
  p.label = value.trim() || p.label;
  p.marker.setTooltipContent(p.label);
  editing = null;
  refresh();
}

function removePoint(id) {
  const p = points.find(p => p.id === id);
  if (p) map.removeLayer(p.marker);
  points = points.filter(p => p.id !== id);
  measurements = measurements.filter(m => m.aId !== id && m.bId !== id);
  if (pending === id) pending = null;
  if (editing === id) editing = null;
  refresh();
}

function removeMeasurement(id) {
  measurements = measurements.filter(m => m.id !== id);
  refresh();
}

function formatDistance(meters) {
  return meters < 1000 ? `${meters.toFixed(0)} m` : `${(meters / 1000).toFixed(2)} km`;
}

function refresh() {
  points.forEach(p => p.marker.setIcon(pointIcon(p.id === pending)));

  document.getElementById('hint').textContent = pending === null
    ? 'Clic en el mapa para marcar un punto, luego en dos puntos para medir'
    : 'Selecciona el segundo punto para completar la medición';

  const list = document.getElementById('points');
  list.innerHTML = '';
  points.forEach(p => {
    const li = document.createElement('li');
    if (p.id === pending) li.classList.add('selected');

    const dot = document.createElement('span');
    dot.className = 'dot';
    li.appendChild(dot);

    if (p.id === editing) {
      const input = document.createElement('input');
      input.className = 'label-edit';
      input.value = p.label;
      input.onclick = (e) => e.stopPropagation();
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
      input.onblur = () => commitRename(p, input.value);
      li.appendChild(input);
      list.appendChild(li);
      input.focus();
      input.select();
      return;
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.title = 'Doble clic para renombrar';
    labelSpan.textContent = p.label;
    labelSpan.ondblclick = (e) => { e.stopPropagation(); editing = p.id; refresh(); };
    li.appendChild(labelSpan);

    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = (e) => { e.stopPropagation(); removePoint(p.id); };
    li.appendChild(btn);

    li.onclick = (e) => { if (e.target.tagName !== 'BUTTON') handlePointClick(p.id); };
    list.appendChild(li);
  });

  measureLayers.forEach(l => map.removeLayer(l));
  measureLayers = [];

  const mList = document.getElementById('measureList');
  mList.innerHTML = '';
  measurements.forEach((m, i) => {
    const pa = points.find(p => p.id === m.aId);
    const pb = points.find(p => p.id === m.bId);
    if (!pa || !pb) return;
    const a = pa.marker.getLatLng(), b = pb.marker.getLatLng();
    const dist = a.distanceTo(b);
    const color = PALETTE[i % PALETTE.length];

    const line = L.polyline([a, b], { color, weight: 2, dashArray: '6 6' }).addTo(map);
    const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const label = L.marker(mid, {
      icon: L.divIcon({
        className: '', html: `<div style="text-align:center"><span class="measure-label" style="background:${color}">${formatDistance(dist)}</span></div>`,
        iconSize: [100, 26], iconAnchor: [50, 13]
      })
    }).addTo(map);
    measureLayers.push(line, label);

    const li = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = color;
    const mLabel = document.createElement('span');
    mLabel.className = 'm-label';
    mLabel.textContent = `${pa.label} → ${pb.label}: ${formatDistance(dist)}`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => removeMeasurement(m.id);
    li.append(swatch, mLabel, btn);
    mList.appendChild(li);
  });
}

map.on('click', e => addPoint(e.latlng.lat, e.latlng.lng, `Punto (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`));

document.getElementById('clear').onclick = () => {
  points.forEach(p => map.removeLayer(p.marker));
  points = [];
  measurements = [];
  pending = null;
  editing = null;
  refresh();
};

// --- Búsqueda por nombre o por coordenadas "lat, lng" ---
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
let searchTimeout;

function goToResult(lat, lng, label) {
  map.flyTo([lat, lng], 15);
  addPoint(lat, lng, label);
  resultsList.innerHTML = '';
  searchInput.value = '';
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  resultsList.innerHTML = '';
  if (!q) return;

  const coordMatch = q.match(COORD_RE);
  if (coordMatch) {
    const [, lat, lng] = coordMatch;
    const li = document.createElement('li');
    li.textContent = `📍 Ir a (${lat}, ${lng})`;
    li.onclick = () => goToResult(parseFloat(lat), parseFloat(lng), `Punto (${lat}, ${lng})`);
    resultsList.appendChild(li);
    return;
  }

  searchTimeout = setTimeout(async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
    const data = await res.json();
    resultsList.innerHTML = '';
    data.forEach(place => {
      const li = document.createElement('li');
      li.textContent = place.display_name;
      li.onclick = () => goToResult(parseFloat(place.lat), parseFloat(place.lon), place.display_name);
      resultsList.appendChild(li);
    });
  }, 400);
});

// --- Exportar / importar como GeoJSON ---
function exportGeoJSON() {
  const features = points.map(p => {
    const ll = p.marker.getLatLng();
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { id: p.id, label: p.label } };
  });
  measurements.forEach(m => {
    const pa = points.find(p => p.id === m.aId), pb = points.find(p => p.id === m.bId);
    if (!pa || !pb) return;
    const a = pa.marker.getLatLng(), b = pb.marker.getLatLng();
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      properties: { id: m.id, aId: m.aId, bId: m.bId, distanceMeters: a.distanceTo(b) }
    });
  });

  const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mapa-puntos.geojson';
  a.click();
  URL.revokeObjectURL(url);
}

function importGeoJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let geojson;
    try {
      geojson = JSON.parse(reader.result);
    } catch {
      alert('El archivo no es un GeoJSON válido.');
      return;
    }

    points.forEach(p => map.removeLayer(p.marker));
    points = [];
    measurements = [];
    pending = null;
    editing = null;
    nextId = 1;
    nextMeasureId = 1;

    const features = geojson.features || [];
    features.filter(f => f.geometry?.type === 'Point').forEach(f => {
      const [lng, lat] = f.geometry.coordinates;
      createPoint(lat, lng, f.properties?.label || `Punto (${lat.toFixed(4)}, ${lng.toFixed(4)})`, f.properties?.id);
    });
    features.filter(f => f.geometry?.type === 'LineString' && f.properties?.aId != null && f.properties?.bId != null).forEach(f => {
      const id = f.properties.id ?? nextMeasureId;
      nextMeasureId = Math.max(nextMeasureId, id + 1);
      measurements.push({ id, aId: f.properties.aId, bId: f.properties.bId });
    });

    refresh();
    if (points.length) {
      map.fitBounds(L.latLngBounds(points.map(p => p.marker.getLatLng())), { padding: [40, 40] });
    }
  };
  reader.readAsText(file);
}

document.getElementById('export').onclick = exportGeoJSON;
document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = (e) => {
  if (e.target.files[0]) importGeoJSON(e.target.files[0]);
  e.target.value = '';
};
