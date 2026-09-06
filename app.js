// --- 1. Map Initialization & Masking ---
var squareCampusBounds = [[23.1500, 80.0000], [23.2000, 80.0500]];

var map = L.map('map', {
  maxBounds: squareCampusBounds,
  maxBoundsViscosity: 1.0,
  minZoom: 15.5,
  maxZoom: 21,
  zoomControl: false
}).setView([23.1755, 80.0225], 16.5);

L.control.zoom({ position: 'topleft' }).addTo(map);

// Premium Google Satellite Base
L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
  maxZoom: 21, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Map &copy; Google'
}).addTo(map);

var outerWorld = [[90, -180], [90, 180], [-90, 180], [-90, -180]];
var squareCutout = [[23.2000, 80.0000], [23.2000, 80.0500], [23.1500, 80.0500], [23.1500, 80.0000]];
L.polygon([outerWorld, squareCutout], { color: '#10b981', weight: 3, fillColor: '#030712', fillOpacity: 0.98 }).addTo(map);

// --- 2. Campus Data & Markers ---
var verifiedBuildings = [
  { name: "Administrative Block", lat: 23.179402, lng: 80.027300, type: 'building', nodeId: 'admin_block' },
  { name: "IIITDM Lecture Hall", lat: 23.176859, lng: 80.024425, type: 'building', nodeId: 'lecture_hall' },
  { name: "Library and Computer Centre", lat: 23.176021, lng: 80.026764, type: 'building', nodeId: 'library' },
  { name: "Students Activity Center", lat: 23.176129, lng: 80.022976, type: 'building', nodeId: 'sac' },
  { name: "Vashistha", lat: 23.178002, lng: 80.022504, type: 'building', nodeId: 'vashistha' },
  { name: "Aryabhatta", lat: 23.176485, lng: 80.020498, type: 'building', nodeId: 'aryabhatta' },
  { name: "Panini", lat: 23.174996, lng: 80.020809, type: 'building', nodeId: 'panini' },
  { name: "Visitor's Hostel", lat: 23.174375, lng: 80.027997, type: 'building', nodeId: 'visitors_hostel' },
  { name: "Central Mess", icon: "🍽️", lat: 23.177195, lng: 80.021206, type: 'food', nodeId: 'central_mess' },
  { name: "Campus Canteen", icon: "☕", lat: 23.178161, lng: 80.024714, type: 'food', nodeId: 'canteen' },
  { name: "Health Centre (PHC)", icon: "🏥", lat: 23.17599, lng: 80.027912, type: 'health', nodeId: 'health_centre' }
];

var labelsGroup = L.layerGroup().addTo(map);

verifiedBuildings.forEach(function(item) {
  if(item.type === 'building') {
    L.marker([item.lat, item.lng], { icon: L.divIcon({ className: 'building-label label-hidden', html: item.name, iconSize: [160, 28], iconAnchor: [80, 14] }) }).addTo(labelsGroup);
  } else {
    L.marker([item.lat, item.lng], { icon: L.divIcon({ className: 'icon-badge label-hidden', html: item.icon, iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(labelsGroup);
  }
});

map.on('zoomend', function() {
  var currentZoom = map.getZoom();
  document.querySelectorAll('.building-label, .icon-badge').forEach(function(el) {
    if (currentZoom >= 17.5) { el.classList.remove('label-hidden'); el.classList.add('label-visible'); }
    else { el.classList.remove('label-visible'); el.classList.add('label-hidden'); }
  });
});

// --- Populate Route Destination Dropdown on Load ---
function initOptimizerDropdown() {
  var select = document.getElementById('waypointSelect');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>-- Select Destination Place --</option>';
  verifiedBuildings.forEach(function(b, idx) {
    var opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = b.name;
    select.appendChild(opt);
  });
}
document.addEventListener('DOMContentLoaded', initOptimizerDropdown);

var activeRoutePolyline = null;
var destinationMarker = null;
var manualStartPoint = null; 
var isPickingManualStart = false;
var manualStartMarker = null;

function handleStartModeChange(selectEl) {
  var mode = selectEl.value;
  var indicator = document.getElementById('modeIndicator');
  
  if (mode === 'manual') {
    isPickingManualStart = true;
    indicator.innerText = "Manual Pick";
    indicator.className = "status-pill";
    alert("Manual Mode Activated: Click anywhere on the map to set your custom starting point.");
  } else {
    isPickingManualStart = false;
    indicator.innerText = "GPS Live";
    indicator.className = "status-pill active";
    if (manualStartMarker) {
      map.removeLayer(manualStartMarker);
      manualStartMarker = null;
    }
    manualStartPoint = null;
  }
}

// Helper function to find the closest graph node ID to a given lat/lng coordinate
function findClosestNodeId(lat, lng) {
  let closestNode = verifiedBuildings[0].nodeId;
  let minDist = Infinity;
  
  verifiedBuildings.forEach(b => {
    let d = map.distance([lat, lng], [b.lat, b.lng]);
    if (d < minDist) {
      minDist = d;
      closestNode = b.nodeId;
    }
  });
  return closestNode;
}

// Calculate route by calling the FastAPI backend Dijkstra endpoint (`main_2.py`)
function calculateOptimizedRouteFromChosenStart() {
  var startMode = document.getElementById('startModeSelect').value;
  var select = document.getElementById('waypointSelect');
  var val = select.value;
  
  if (val === "") {
    alert("Please select a destination from the dropdown list.");
    return;
  }

  var startLat, startLng;

  if (startMode === 'manual') {
    if (!manualStartPoint) {
      alert("Please click on the map first to set your manual starting location.");
      isPickingManualStart = true;
      return;
    }
    startLat = manualStartPoint.lat;
    startLng = manualStartPoint.lng;
  } else {
    if (!currentGPSPosition) {
      alert("Live GPS coordinate not found. Make sure 'Hardware Sync' / Live GPS is active or switch to 'Pick Start Point on Map'.");
      requestAndZoomToLocation();
      return;
    }
    startLat = currentGPSPosition.lat;
    startLng = currentGPSPosition.lng;
  }

  var destination = verifiedBuildings[val];
  var startNodeId = findClosestNodeId(startLat, startLng);
  var endNodeId = destination.nodeId || 'admin_block'; // Fallback node ID if missing

  if (activeRoutePolyline) { map.removeLayer(activeRoutePolyline); activeRoutePolyline = null; }
  if (destinationMarker) { map.removeLayer(destinationMarker); destinationMarker = null; }

  // Call FastAPI backend for accurate path graph routing
  fetch('https://raisin-washing-nearest.ngrok-free.dev/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_node: startNodeId,
      end_node: endNodeId
    })
  })
  .then(response => response.json())
  .then(data => {
    if (!data.success) {
      alert("Routing error: " + (data.detail || "Could not find a path."));
      return;
    }

    // Map all intermediate graph nodes returned by FastAPI into Leaflet coordinates
    var pathLatLngs = data.coordinates.map(function(coord) {
      return [coord.latitude, coord.longitude];
    });

    activeRoutePolyline = L.polyline(pathLatLngs, {
      color: '#3b82f6',
      weight: 6,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    var destLat = destination.lat;
    var destLng = destination.lng;

    destinationMarker = L.circleMarker([destLat, destLng], {
      radius: 10,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(map).bindPopup(`<b>Destination: ${destination.name}</b>`).openPopup();

    map.fitBounds(activeRoutePolyline.getBounds(), { padding: [70, 70] });
    
    document.getElementById('optimizerStats').innerHTML = `Route to <b>${destination.name}</b>: <b>${data.distance_meters.toFixed(1)}m</b> (${data.estimated_time_minutes} mins)`;
  })
  .catch(error => {
    console.error("Backend connection error:", error);
    alert("Could not reach FastAPI backend. Make sure main.py is running on port 8000.");
  });
}

function clearOptimizerRoute() {
  var select = document.getElementById('waypointSelect');
  if(select) select.selectedIndex = 0;
  
  if (activeRoutePolyline) { map.removeLayer(activeRoutePolyline); activeRoutePolyline = null; }
  if (destinationMarker) { map.removeLayer(destinationMarker); destinationMarker = null; }
  if (manualStartMarker) { map.removeLayer(manualStartMarker); manualStartMarker = null; }
  manualStartPoint = null;
  document.getElementById('optimizerStats').innerText = "Distance Telemetry: --";
}

// --- 3. Google-Style Autocomplete Search Bar Logic ---
function handleSearchInput() {
  var query = document.getElementById('searchInput').value.toLowerCase().trim();
  var dropdown = document.getElementById('searchDropdown');
  
  dropdown.innerHTML = '';

  if (!query) {
    dropdown.style.display = 'none';
    return;
  }

  var matches = verifiedBuildings.filter(function(loc) {
    return loc.name.toLowerCase().includes(query);
  });

  if (matches.length > 0) {
    dropdown.style.display = 'block';
    
    matches.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'search-dropdown-item';
      
      var icon = item.icon || '📍';
      div.innerHTML = `<span class="dropdown-icon">${icon}</span> <span>${item.name}</span>`;
      
      div.onclick = function() {
        document.getElementById('searchInput').value = item.name;
        dropdown.style.display = 'none';
        focusOnLocation(item.lat, item.lng, item.name);
      };
      
      dropdown.appendChild(div);
    });
  } else {
    dropdown.style.display = 'none';
  }
}

document.addEventListener('click', function(e) {
  var searchBox = document.querySelector('.search-box');
  var dropdown = document.getElementById('searchDropdown');
  if (searchBox && !searchBox.contains(e.target)) {
    if (dropdown) dropdown.style.display = 'none';
  }
});

function focusOnLocation(lat, lng, name) {
  map.flyTo([lat, lng], 18.5, { duration: 1.2, easeLinearity: 0.25 });
  var historyList = document.getElementById('historyList');
  var newItem = document.createElement('li');
  newItem.className = 'history-item';
  newItem.onclick = function() { focusOnLocation(lat, lng, name); };
  newItem.innerHTML = `
    <div class="history-info">
      <div class="history-icon-box">📍</div>
      <div>
        <div class="h-title">${name}</div>
        <div class="h-sub">Custom Target Route</div>
      </div>
    </div>
    <span class="history-time">Just now</span>
  `;
  historyList.insertBefore(newItem, historyList.firstChild);
}

// --- 4. HIGH-PRECISION GPS & CURRENT LOCATION TRACKING ---
var userMarker = null;
var accuracyCircle = null;
var watchId = null;
var currentGPSPosition = null;

var campusPathways = turf.multiLineString([
  [[80.0220, 23.1795], [80.0235, 23.1775], [80.0245, 23.1768], [80.0270, 23.1748], [80.0280, 23.1732]]
]);

var lastFilteredLat = null;
var lastFilteredLng = null;
var SMOOTHING_FACTOR = 0.5;

function applyLowPassFilter(newLat, newLng) {
  if (lastFilteredLat === null) {
    lastFilteredLat = newLat; lastFilteredLng = newLng;
    return { lat: newLat, lng: newLng };
  }
  lastFilteredLat = lastFilteredLat + SMOOTHING_FACTOR * (newLat - lastFilteredLat);
  lastFilteredLng = lastFilteredLng + SMOOTHING_FACTOR * (newLng - lastFilteredLng);
  return { lat: lastFilteredLat, lng: lastFilteredLng };
}

function snapToNearestPath(lat, lng) {
  var userPt = turf.point([lng, lat]);
  var snappedPt = turf.nearestPointOnLine(campusPathways, userPt, { units: 'meters' });
  if (snappedPt.properties.dist < 15) {
    return { lat: snappedPt.geometry.coordinates[1], lng: snappedPt.geometry.coordinates[0], isSnapped: true };
  }
  return { lat: lat, lng: lng, isSnapped: false };
}

function updateMapLocation(lat, lng, acc) {
  var smoothed = applyLowPassFilter(lat, lng);
  var finalPos = snapToNearestPath(smoothed.lat, smoothed.lng);

  currentGPSPosition = { lat: finalPos.lat, lng: finalPos.lng };

  if (userMarker) map.removeLayer(userMarker);
  if (accuracyCircle) map.removeLayer(accuracyCircle);

  var visualRadius = Math.min(acc, 25); 

  accuracyCircle = L.circle([finalPos.lat, finalPos.lng], {
    radius: visualRadius, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.12, weight: 1.5
  }).addTo(map);

  var dotColor = finalPos.isSnapped ? '#3b82f6' : '#10b981';
  userMarker = L.circleMarker([finalPos.lat, finalPos.lng], {
    radius: 8, fillColor: dotColor, color: '#ffffff', weight: 3, fillOpacity: 1.0
  }).addTo(map);
}

function handleLocationToggle(toggle) {
  if (toggle.checked) enableDeviceGPS();
  else disableDeviceGPS();
}

function enableDeviceGPS() {
  var statusText = document.getElementById('permissionStatus');
  var locBtn = document.getElementById('locBtn');
  
  if ("geolocation" in navigator) {
    statusText.innerText = "Syncing...";
    statusText.className = "status-pill active";

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        updateMapLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      function(err) { console.warn("Instant fix skipped"); },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 10000 }
    );
    
    watchId = navigator.geolocation.watchPosition(
      function(position) {
        updateMapLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);

        statusText.innerText = "Live Active";
        statusText.className = "status-pill active";
        document.getElementById('locationToggle').checked = true;
        locBtn.classList.add('active-pulse');
      },
      function(error) {
        statusText.innerText = "Signal Lost";
        statusText.className = "status-pill";
        document.getElementById('locationToggle').checked = false;
        locBtn.classList.remove('active-pulse');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  } else { alert("GPS is not supported."); }
}

function disableDeviceGPS() {
  var statusText = document.getElementById('permissionStatus');
  var locBtn = document.getElementById('locBtn');
  
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
  lastFilteredLat = null; lastFilteredLng = null;
  currentGPSPosition = null;
  
  statusText.innerText = "Offline";
  statusText.className = "status-pill";
  locBtn.classList.remove('active-pulse');
}

function requestAndZoomToLocation() {
  var btn = document.getElementById('locBtn');
  var toggle = document.getElementById('locationToggle');
  
  if (!toggle.checked) { toggle.checked = true; enableDeviceGPS(); }
  
  if ("geolocation" in navigator) {
    btn.innerHTML = '⏳'; 
    
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        btn.innerHTML = '<span class="btn-icon">🎯</span>';
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var bounds = L.latLngBounds(squareCampusBounds);
        
        if (!bounds.contains([lat, lng])) {
          alert("You are outside the campus tracking boundaries.");
        } else { 
          map.flyTo([lat, lng], 19.5, { duration: 1.0 }); 
        }
      },
      function(err) { 
        btn.innerHTML = '<span class="btn-icon">🎯</span>'; 
        alert("Location timeout. Make sure GPS permissions are allowed."); 
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 10000 }
    );
  }
}

// --- 5. ADMIN ZONES & MANUAL MAP CLICK ROUTING ---
var isAdminLoggedIn = false;
var activeDrawingType = null; 

var tempDrawPoints = [];
var tempDrawMarkers = [];
var tempPreviewPolygon = null;

var nightZonePolygon = null;
var constructionPolygon = null;

function openAdminPortal() {
  var pin = prompt("Enter Admin PIN (Default: 1234):");
  if (pin === "1234") {
    isAdminLoggedIn = true;
    document.getElementById('adminControlCard').style.display = 'block';
    document.getElementById('adminLoginBtn').innerHTML = '🔓 Secure Active';
    alert("Admin privileges granted successfully.");
  } else if (pin !== null) {
    alert("Incorrect Admin PIN.");
  }
}

function startDrawingZone() {
  if (!isAdminLoggedIn) return;
  activeDrawingType = 'restriction';
  initDrawingMode("Click points on the map for Safety Boundary (Double click to finish)");
}

function startDrawingRoad() {
  if (!isAdminLoggedIn) return;
  activeDrawingType = 'construction';
  initDrawingMode("Click points on the map for Road Blockage (Double click to finish)");
}

function initDrawingMode(message) {
  tempDrawPoints = [];
  clearTempDrawing();
  document.getElementById('map').classList.add('drawing-cursor');
  alert(message);
}

// Global Map Click Handler (Manages Manual Start Picking & Admin Drawing)
map.on('click', function(e) {
  if (isPickingManualStart) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;
    
    manualStartPoint = { lat: lat, lng: lng };
    
    if (manualStartMarker) map.removeLayer(manualStartMarker);
    
    manualStartMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: 'icon-badge', html: '🚀', iconSize: [36, 36], iconAnchor: [18, 18] })
    }).addTo(map).bindPopup("<b>Custom Start Point</b>").openPopup();

    isPickingManualStart = false;
    alert("Custom start point set successfully! Now choose your destination and click Calculate Route.");
    return;
  }

  if (!activeDrawingType) return;

  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  tempDrawPoints.push([lat, lng]);

  var colorHex = activeDrawingType === 'restriction' ? '#3b82f6' : '#f59e0b';
  var m = L.circleMarker([lat, lng], { radius: 5, color: colorHex, fillColor: colorHex, fillOpacity: 1 }).addTo(map);
  tempDrawMarkers.push(m);

  if (tempDrawPoints.length >= 2) {
    if (tempPreviewPolygon) map.removeLayer(tempPreviewPolygon);
    tempPreviewPolygon = L.polygon(tempDrawPoints, { color: colorHex, weight: 2, fillColor: colorHex, fillOpacity: 0.25, dashArray: '4, 4' }).addTo(map);
  }
});

map.on('dblclick', function(e) {
  if (!activeDrawingType) return;
  e.originalEvent.preventDefault();

  if (tempDrawPoints.length < 3) {
    alert("Please click at least 3 points.");
    return;
  }

  var type = activeDrawingType;
  activeDrawingType = null;
  document.getElementById('map').classList.remove('drawing-cursor');

  if (type === 'restriction') {
    window.lastDrawnRestriction = [...tempDrawPoints];
    document.getElementById('drawBtn').innerText = '✅ Safety Boundary Ready';
    alert("Safety boundary captured!");
  } else {
    window.lastDrawnConstruction = [...tempDrawPoints];
    document.getElementById('drawRoadBtn').innerText = '✅ Blocked Path Ready';
    alert("Road blockage boundary captured!");
  }
  clearTempDrawing();
});

function clearTempDrawing() {
  tempDrawMarkers.forEach(m => map.removeLayer(m));
  tempDrawMarkers = [];
  if (tempPreviewPolygon) { map.removeLayer(tempPreviewPolygon); tempPreviewPolygon = null; }
}

function saveAdminRestriction() {
  if (!isAdminLoggedIn) return;
  if (!window.lastDrawnRestriction) {
    alert("Please draw a safety boundary first!");
    return;
  }
  var data = {
    name: document.getElementById('zoneNameInput').value,
    start: document.getElementById('adminStartTime').value,
    end: document.getElementById('adminEndTime').value,
    coords: window.lastDrawnRestriction,
    active: true
  };
  localStorage.setItem('adminCustomRestriction', JSON.stringify(data));
  document.getElementById('drawBtn').innerText = '✏️ Draw Safety Boundary';
  alert("Safety schedule published successfully!");
  evaluateRestrictionSchedule();
}

function saveAdminConstruction() {
  if (!isAdminLoggedIn) return;
  if (!window.lastDrawnConstruction) {
    alert("Please draw a road blockage zone first!");
    return;
  }
  var data = {
    reason: document.getElementById('roadReasonInput').value,
    coords: window.lastDrawnConstruction,
    active: true
  };
  localStorage.setItem('adminConstructionZone', JSON.stringify(data));
  document.getElementById('drawRoadBtn').innerText = '✏️ Draw Blocked Path';
  alert("Road blockage published successfully!");
  loadConstructionZone();
}

function clearConstruction() {
  if (!isAdminLoggedIn) return;
  localStorage.removeItem('adminConstructionZone');
  if (constructionPolygon) {
    map.removeLayer(constructionPolygon);
    constructionPolygon = null;
  }
  document.getElementById('roadStatus').innerText = "Road Blockages: None Active";
  alert("Road blockage removed.");
}

function loadConstructionZone() {
  var saved = localStorage.getItem('adminConstructionZone');
  var roadStatus = document.getElementById('roadStatus');

  if (!saved) {
    if (roadStatus) roadStatus.innerText = "Road Blockages: None Active";
    return;
  }

  var cData = JSON.parse(saved);
  if (roadStatus) {
    roadStatus.innerText = `Hazard: 🚧 Blocked [${cData.reason}]`;
    roadStatus.style.color = "#f59e0b";
  }

  if (!constructionPolygon) {
    constructionPolygon = L.polygon(cData.coords, {
      color: '#f59e0b',
      weight: 3,
      fillColor: '#f59e0b',
      fillOpacity: 0.45,
      dashArray: '6, 6'
    }).addTo(map).bindPopup(`<b>🚧 Road Construction / Hazard</b><br>Reason: ${cData.reason}<br><i>Route recalculated around blockade.</i>`);
  }
}

function evaluateRestrictionSchedule() {
  var saved = localStorage.getItem('adminCustomRestriction');
  var statusBadge = document.getElementById('nightModeStatus');

  if (!saved) {
    if (statusBadge) statusBadge.innerText = "Restricted Zone: None Set";
    return;
  }

  var restriction = JSON.parse(saved);
  var now = new Date();
  var currentMinutes = now.getHours() * 60 + now.getMinutes();

  var startParts = restriction.start.split(':');
  var startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);

  var endParts = restriction.end.split(':');
  var endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

  var isWithinWindow = false;
  if (startMinutes < endMinutes) {
    isWithinWindow = (currentMinutes >= startMinutes && currentMinutes <= endMinutes);
  } else {
    isWithinWindow = (currentMinutes >= startMinutes || currentMinutes <= endMinutes);
  }

  if (isWithinWindow) {
    if (statusBadge) {
      statusBadge.innerText = `Restricted Zone: Active [${restriction.name}]`;
      statusBadge.style.color = "#f43f5e";
    }

    if (!nightZonePolygon) {
      nightZonePolygon = L.polygon(restriction.coords, {
        color: '#f43f5e',
        weight: 2,
        fillColor: '#f43f5e',
        fillOpacity: 0.4,
        dashArray: '5, 5'
      }).addTo(map).bindPopup(`<b>⚠️ Restricted Safety Zone: ${restriction.name}</b><br>Active Window: ${restriction.start} - ${restriction.end}`);
    }
  } else {
    if (statusBadge) {
      statusBadge.innerText = `Restricted Zone: Scheduled (${restriction.start} - ${restriction.end})`;
      statusBadge.style.color = "var(--text-muted)";
    }

    if (nightZonePolygon) {
      map.removeLayer(nightZonePolygon);
      nightZonePolygon = null;
    }
  }
}

setInterval(() => {
  evaluateRestrictionSchedule();
}, 30000);

setTimeout(() => {
  evaluateRestrictionSchedule();
  loadConstructionZone();
}, 500);