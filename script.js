const COLOMBIA_CENTER = [4.5709, -74.2973];
const map = L.map('map', { zoomControl: false }).setView(COLOMBIA_CENTER, 6);
navigator.geolocation?.getCurrentPosition(
  pos => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
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
let pending = null;     // id of the point waiting for its pair
let measurements = [];  // {id, aId, bId}
let nextMeasureId = 1;
let measureLayers = []; // leaflet layers currently drawn for measurements
const PALETTE = ['#f43f5e', '#f97316', '#0ea5e9', '#8b5cf6', '#22c55e', '#eab308'];

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

function addPoint(lat, lng, label) {
  const id = nextId++;
  const marker = L.marker([lat, lng], { icon: pointIcon(false) }).addTo(map);
  marker.on('click', () => handlePointClick(id));
  points.push({ id, marker, label });
  refresh();
}

function removePoint(id) {
  const p = points.find(p => p.id === id);
  if (p) map.removeLayer(p.marker);
  points = points.filter(p => p.id !== id);
  measurements = measurements.filter(m => m.aId !== id && m.bId !== id);
  if (pending === id) pending = null;
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
    li.innerHTML = `<span class="dot"></span><span class="label">${p.label}</span>`;
    li.onclick = (e) => { if (e.target.tagName !== 'BUTTON') handlePointClick(p.id); };
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => removePoint(p.id);
    li.appendChild(btn);
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
    li.innerHTML = `<span class="swatch" style="background:${color}"></span><span class="m-label">${formatDistance(dist)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => removeMeasurement(m.id);
    li.appendChild(btn);
    mList.appendChild(li);
  });
}

map.on('click', e => addPoint(e.latlng.lat, e.latlng.lng, `Punto (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`));

document.getElementById('clear').onclick = () => {
  points.forEach(p => map.removeLayer(p.marker));
  points = [];
  measurements = [];
  pending = null;
  refresh();
};

const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
let searchTimeout;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (!q) { resultsList.innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
    const data = await res.json();
    resultsList.innerHTML = '';
    data.forEach(place => {
      const li = document.createElement('li');
      li.textContent = place.display_name;
      li.onclick = () => {
        const lat = parseFloat(place.lat), lng = parseFloat(place.lon);
        map.setView([lat, lng], 15);
        addPoint(lat, lng, place.display_name);
        resultsList.innerHTML = '';
        searchInput.value = '';
      };
      resultsList.appendChild(li);
    });
  }, 400);
});
