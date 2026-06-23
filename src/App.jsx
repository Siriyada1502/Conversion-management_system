import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import proj4 from "proj4";
import rawPlotJson from "./data/plot.json";

const UTM47 = "+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs";
const WGS84 = "EPSG:4326";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function parseNumberList(text) {
  return String(text)
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => !Number.isNaN(v));
}


function utmToLatLng(northing, easting) {
  const [lng, lat] = proj4(UTM47, WGS84, [easting, northing]);
  return [lat, lng];
}

function latLngToUtm(lat, lng) {
  const [easting, northing] = proj4(WGS84, UTM47, [lng, lat]);
  return { easting, northing };
}

function calculateAreaUtm(utmPoints) {
  if (utmPoints.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < utmPoints.length; i++) {
    const j = (i + 1) % utmPoints.length;
    sum += utmPoints[i].easting * utmPoints[j].northing;
    sum -= utmPoints[j].easting * utmPoints[i].northing;
  }

  return Math.abs(sum / 2);
}

function getCenterLatLng(latLngPoints) {
  const total = latLngPoints.reduce(
    (sum, point) => {
      sum.lat += point[0];
      sum.lng += point[1];
      return sum;
    },
    { lat: 0, lng: 0 }
  );

  return [total.lat / latLngPoints.length, total.lng / latLngPoints.length];
}

function preparePlots(json) {
  const rows = Array.isArray(json) ? json : json.data || [];

  return rows.map((plot) => {
    const northings = parseNumberList(plot.plot_lat);
    const eastings = parseNumberList(plot.plot_long);

    const utmPoints = northings.map((northing, index) => ({
      northing,
      easting: eastings[index],
    })).filter((point) => point.easting);

    const latLngPoints = utmPoints.map((point) =>
      utmToLatLng(point.northing, point.easting)
    );

    return {
      ...plot,
      utmPoints,
      latLngPoints,
      area: calculateAreaUtm(utmPoints),
      center: getCenterLatLng(latLngPoints),
    };
  });
}

function formatArea(area) {
  const rai = area / 1600;
  return `${area.toFixed(2)} ตร.ม. / ${rai.toFixed(2)} ไร่`;
}

function AddPointHandler({ isAdding, onAddPoint }) {
  useMapEvents({
    click(e) {
      if (!isAdding) return;
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });

  return null;
}

export default function App() {
  const initialPlots = useMemo(() => preparePlots(rawPlotJson), []);
  const [plots, setPlots] = useState(() => {
    const saved = localStorage.getItem("plots");
    return saved ? preparePlots(JSON.parse(saved)) : initialPlots;
  });

  const [search, setSearch] = useState("");
  const [selectedPlotId, setSelectedPlotId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newPlotName, setNewPlotName] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newCrop, setNewCrop] = useState("");
  const [newPoints, setNewPoints] = useState([]);

  const filteredPlots = plots.filter((plot) =>
    String(plot.plot_id).includes(search.trim()) ||
    String(plot.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedPlot = plots.find((plot) => plot.plot_id === selectedPlotId);
  const mapCenter = plots[0]?.center || [14.6, 101.1];

  function addNewPoint(point) {
    setNewPoints((prev) => [...prev, point]);
  }

  function clearNewPlot() {
    setNewPoints([]);
    setNewPlotName("");
    setNewOwner("");
    setNewCrop("");
  }

  function saveNewPlot() {
    if (newPoints.length < 4) {
      alert("ต้องปักอย่างน้อย 4 จุดก่อนบันทึกแปลง");
      return;
    }

    const newId = Date.now();
    const utm = newPoints.map(([lat, lng]) => latLngToUtm(lat, lng));

  
    const closedUtm = [...utm, utm[0]];

    const newRawPlot = {
      plot_id: newId,
      name: newPlotName || `แปลง ${newId}`,
      owner: newOwner,
      crop: newCrop,
      plot_lat: closedUtm.map((p) => p.northing.toFixed(5)).join(","),
      plot_long: closedUtm.map((p) => p.easting.toFixed(6)).join(","),
      point_no: closedUtm.map((_, index) => index + 1).join(","),
    };

    const updatedRaw = [...plots, ...preparePlots([newRawPlot])];
    setPlots(updatedRaw);

    const rawForSave = updatedRaw.map((plot) => ({
      plot_id: plot.plot_id,
      name: plot.name || "",
      owner: plot.owner || "",
      crop: plot.crop || "",
      plot_lat: plot.plot_lat,
      plot_long: plot.plot_long,
      point_no: plot.point_no,
    }));

    localStorage.setItem("plots", JSON.stringify({ success: "true", data: rawForSave }));
    clearNewPlot();
    setIsAdding(false);
    alert("บันทึกใน Local Storage แล้ว ถ้าจะส่งงานให้กดปุ่มดาวน์โหลด JSON");
  }

  function downloadJson() {
    const rawForSave = plots.map((plot) => ({
      plot_id: plot.plot_id,
      name: plot.name || "",
      owner: plot.owner || "",
      crop: plot.crop || "",
      plot_lat: plot.plot_lat,
      plot_long: plot.plot_long,
      point_no: plot.point_no,
    }));

    const blob = new Blob(
      [JSON.stringify({ success: "true", data: rawForSave }, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plot-updated.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetData() {
    localStorage.removeItem("plots");
    setPlots(initialPlots);
    clearNewPlot();
  }

  return (
    <div className="page">
      <aside className="sidebar">
        <h1>ระบบจัดการแปลง</h1>

        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาเลขแปลง เช่น 347898"
        />

        <div className="summary">
          <b>จำนวนแปลง:</b> {filteredPlots.length}
        </div>

        <button onClick={() => setIsAdding(!isAdding)} className="primary">
          {isAdding ? "หยุดเพิ่มแปลง" : "เพิ่มแปลงใหม่"}
        </button>

        {isAdding && (
          <div className="form">
            <input value={newPlotName} onChange={(e) => setNewPlotName(e.target.value)} placeholder="ชื่อแปลง" />
            <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="เจ้าของแปลง" />
            <input value={newCrop} onChange={(e) => setNewCrop(e.target.value)} placeholder="ชนิดพืช" />
            <p>ปักแล้ว: {newPoints.length} จุด</p>
            <button onClick={() => setNewPoints((prev) => prev.slice(0, -1))}>ลบจุดล่าสุด</button>
            <button onClick={clearNewPlot}>ล้างจุด</button>
            <button onClick={saveNewPlot} className="success">บันทึกแปลง</button>
          </div>
        )}

        <button onClick={downloadJson}>ดาวน์โหลด JSON</button>
        <button onClick={resetData} className="danger">รีเซ็ตข้อมูลเดิม</button>

        <h2>รายการแปลง</h2>
        <div className="plot-list">
          {filteredPlots.map((plot) => (
            <button
              key={plot.plot_id}
              className={`plot-card ${selectedPlotId === plot.plot_id ? "active" : ""}`}
              onClick={() => setSelectedPlotId(plot.plot_id)}
            >
              <b>แปลง {plot.plot_id}</b>
              <span>{formatArea(plot.area)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="map-area">
        <MapContainer center={mapCenter} zoom={15} className="map">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <AddPointHandler isAdding={isAdding} onAddPoint={addNewPoint} />

          {filteredPlots.map((plot) => (
            <Polygon
              key={plot.plot_id}
              positions={plot.latLngPoints}
              eventHandlers={{ click: () => setSelectedPlotId(plot.plot_id) }}
            >
              <Popup>
                <b>แปลง {plot.plot_id}</b>
                <br />
                พื้นที่: {formatArea(plot.area)}
                <br />
                จุดกึ่งกลาง: {plot.center[0].toFixed(6)}, {plot.center[1].toFixed(6)}
              </Popup>
            </Polygon>
          ))}

          {selectedPlot && (
            <Marker position={selectedPlot.center} icon={markerIcon}>
              <Popup>
                <b>จุดกึ่งกลางแปลง {selectedPlot.plot_id}</b>
                <br />
                {selectedPlot.center[0].toFixed(6)}, {selectedPlot.center[1].toFixed(6)}
              </Popup>
            </Marker>
          )}

          {newPoints.length > 0 && (
            <>
              <Polygon positions={newPoints} />
              {newPoints.map((point, index) => (
                <Marker key={index} position={point} icon={markerIcon}>
                  <Popup>จุดที่ {index + 1}</Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>

        {selectedPlot && (
          <div className="info-panel">
            <h2>รายละเอียดแปลง {selectedPlot.plot_id}</h2>
            <p><b>พื้นที่:</b> {formatArea(selectedPlot.area)}</p>
            <p><b>จุดกึ่งกลาง:</b> {selectedPlot.center[0].toFixed(6)}, {selectedPlot.center[1].toFixed(6)}</p>
            <p><b>จำนวนจุด:</b> {selectedPlot.latLngPoints.length}</p>
          </div>
        )}
      </main>
    </div>
  );
}
