"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

mapboxgl.accessToken =
  "pk.eyJ1Ijoiam9obnc2NDEyIiwiYSI6ImNtZmVmamcwcjA2Y2kybXEya2VxbzZieHoifQ.2kquBH8X1UCVpHpjJQOBbw";

export default function Home() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const geocoderRef = useRef(null);
  const navControlRef = useRef(null);
  const geolocateControlRef = useRef(null);
  const [areaInfo, setAreaInfo] = useState({ sqm: 0, sqft: 0 });
  const [address, setAddress] = useState("");
  const [currentStep, setCurrentStep] = useState(1); // 1: Select Area, 2: Contact, 3: Review
  const [formValues, setFormValues] = useState({ name: "", phone: "", email: "" });
  const [formErrors, setFormErrors] = useState({ name: "", phone: "", email: "" });
  const [roofAreas, setRoofAreas] = useState([]); // { id, sqm, sqft, geometry }
  const [addressError, setAddressError] = useState("");
  const [highlightedPolygons, setHighlightedPolygons] = useState([]); // Store polygon data for highlighting
  const [currentPolygon, setCurrentPolygon] = useState(null); // Store current polygon geometry
  const [isDrawingMode, setIsDrawingMode] = useState(false); // Track if user is in drawing mode

  useEffect(() => {
    if (!mapContainerRef.current) {
      console.log("Map container ref is null");
      return;
    }

    console.log("Initializing map...");
    let map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-96, 37.8],
        zoom: 3,
      });
      mapRef.current = map;
      console.log("Map initialized successfully");
    } catch (error) {
      console.error("Error initializing map:", error);
      return;
    }

    const nav = new mapboxgl.NavigationControl({ visualizePitch: true });
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    });
    navControlRef.current = nav;
    geolocateControlRef.current = geolocate;
    map.addControl(nav, "top-left");
    map.addControl(geolocate, "top-left");

    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
      marker: false,
      placeholder: "Search address in USA",
      countries: "us", // Restrict to USA only
      types: "address,poi", // Only addresses and points of interest
    });
    geocoderRef.current = geocoder;
    map.addControl(geocoder, "top-left");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
      defaultMode: "simple_select",
      styles: [
        // Style for drawing mode
        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#3fb1ce',
            'fill-outline-color': '#3fb1ce',
            'fill-opacity': 0.3
          }
        },
        {
          id: 'gl-draw-polygon-stroke-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3fb1ce',
            'line-width': 3
          }
        },
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.3
          }
        },
        {
          id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#fbb03b',
            'line-width': 3
          }
        }
      ]
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    const updateAreaFromFeatures = () => {
      if (!drawRef.current) return;
      const data = drawRef.current.getAll();
      if (!data || !data.features || data.features.length === 0) {
        setAreaInfo({ sqm: 0, sqft: 0 });
        setCurrentPolygon(null);
        return;
      }
      const polygonFeature = data.features.find((f) => f.geometry && f.geometry.type === "Polygon");
      if (!polygonFeature) {
        setAreaInfo({ sqm: 0, sqft: 0 });
        setCurrentPolygon(null);
        return;
      }
      try {
        const sqm = turf.area(polygonFeature);
        const sqft = sqm * 10.7639;
        setAreaInfo({ sqm, sqft });
        setCurrentPolygon(polygonFeature.geometry);
      } catch (e) {
        setAreaInfo({ sqm: 0, sqft: 0 });
        setCurrentPolygon(null);
      }
    };

    const handleCreate = () => updateAreaFromFeatures();
    const handleUpdate = () => updateAreaFromFeatures();
    const handleDelete = () => updateAreaFromFeatures();

    map.on("draw.create", handleCreate);
    map.on("draw.update", handleUpdate);
    map.on("draw.delete", handleDelete);
    
    // Track drawing mode changes
    map.on("draw.modechange", (e) => {
      setIsDrawingMode(e.mode === "draw_polygon");
    });
    
    // Add building outlines when map loads
    map.on("load", () => {
      addBuildingOutlines();
    });

    geocoder.on("result", (ev) => {
      if (!ev || !ev.result || !ev.result.center) return;
      const [lon, lat] = ev.result.center;
      map.flyTo({ center: [lon, lat], zoom: 16 });
      if (ev.result.place_name) {
        // Check if the result is from USA
        const isUSA = ev.result.context && ev.result.context.some(ctx => 
          ctx.id && ctx.id.startsWith('country') && ctx.short_code === 'us'
        );
        
        if (isUSA) {
          setAddress(ev.result.place_name);
          setAddressError("");
        } else {
          setAddressError("Please select an address in the United States only.");
          setAddress("");
        }
      }
    });

    return () => {
      try {
        if (geocoderRef.current) {
          geocoderRef.current.off("result");
          map.removeControl(geocoderRef.current);
        }
        if (drawRef.current) {
          map.off("draw.create", handleCreate);
          map.off("draw.update", handleUpdate);
          map.off("draw.delete", handleDelete);
          map.removeControl(drawRef.current);
        }
        if (navControlRef.current) {
          map.removeControl(navControlRef.current);
        }
        if (geolocateControlRef.current) {
          map.removeControl(geolocateControlRef.current);
        }
      } catch (e) {
        // no-op
      }
      map.remove();
    };
  }, []);

  // Function to update highlighted polygons on the map
  const updateHighlightedPolygons = (polygons) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Remove existing highlight layer if it exists
    if (map.getLayer('highlighted-polygons-outline')) {
      map.removeLayer('highlighted-polygons-outline');
    }
    if (map.getLayer('highlighted-polygons')) {
      map.removeLayer('highlighted-polygons');
    }
    if (map.getSource('highlighted-polygons')) {
      map.removeSource('highlighted-polygons');
    }
    
    if (polygons.length === 0) return;
    
    // Create GeoJSON for all highlighted polygons
    const geojson = {
      type: 'FeatureCollection',
      features: polygons.map((polygon, index) => ({
        type: 'Feature',
        properties: {
          id: polygon.id,
          color: `hsl(${(index * 137.5) % 360}, 70%, 50%)` // Generate different colors
        },
        geometry: polygon.geometry
      }))
    };
    
    // Add source and layer for highlighted polygons
    map.addSource('highlighted-polygons', {
      type: 'geojson',
      data: geojson
    });
    
    map.addLayer({
      id: 'highlighted-polygons',
      type: 'fill',
      source: 'highlighted-polygons',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.6
      }
    });
    
    map.addLayer({
      id: 'highlighted-polygons-outline',
      type: 'line',
      source: 'highlighted-polygons',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.8
      }
    });
  };

  // Function to add building outlines for better roof identification
  const addBuildingOutlines = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    // Add building layer if it doesn't exist
    if (!map.getLayer('building-outlines')) {
      map.addLayer({
        id: 'building-outlines',
        type: 'line',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        paint: {
          'line-color': '#ff6b6b',
          'line-width': 2,
          'line-opacity': 0.6
        }
      });
    }
  };

  // Update highlighted polygons when the state changes
  useEffect(() => {
    updateHighlightedPolygons(highlightedPolygons);
  }, [highlightedPolygons]);

  const startPolygonMode = () => {
    if (drawRef.current) {
      drawRef.current.changeMode("draw_polygon");
    }
  };

  const deleteSelected = () => {
    if (drawRef.current) {
      drawRef.current.trash();
    }
  };

  const validateContact = () => {
    const errors = { name: "", phone: "", email: "" };
    if (!formValues.name.trim()) errors.name = "Name is required";
    const phoneDigits = formValues.phone.replace(/\D/g, "");
    if (phoneDigits.length < 7) errors.phone = "Enter a valid phone";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email);
    if (!emailOk) errors.email = "Enter a valid email";
    setFormErrors(errors);
    return !errors.name && !errors.phone && !errors.email;
  };

  const goNext = () => {
    if (currentStep === 1) {
      if (roofAreas.length === 0) return;
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!validateContact()) return;
      setCurrentStep(3);
    }
  };

  const goBack = () => {
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // In real app, send to API. For now, log payload.
    const payload = {
      address,
      roofAreas,
      totalAreaSqm: roofAreas.reduce((sum, area) => sum + area.sqm, 0),
      totalAreaSqft: roofAreas.reduce((sum, area) => sum + area.sqft, 0),
      ...formValues,
    };
  
    alert("Submitted! Check console for payload.");
  };
  

  const addCurrentRoofArea = () => {
    if (!address || areaInfo.sqm <= 0 || addressError || !currentPolygon) return;
    const id = Date.now().toString();
    setRoofAreas((prev) => [
      ...prev,
      { id, sqm: areaInfo.sqm, sqft: areaInfo.sqft, geometry: currentPolygon },
    ]);
    
    // Add polygon to highlighted polygons
    setHighlightedPolygons((prev) => [
      ...prev,
      { id, geometry: currentPolygon }
    ]);
    
    if (drawRef.current) {
      try { drawRef.current.deleteAll(); } catch (e) {}
    }
    setAreaInfo({ sqm: 0, sqft: 0 });
    setCurrentPolygon(null);
  };

  const removeRoofArea = (id) => {
    setRoofAreas((prev) => prev.filter((area) => area.id !== id));
    setHighlightedPolygons((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="map-wrap">
      <div className="toolbar">
        <button onClick={startPolygonMode}>Draw new roof shape</button>
        <button onClick={deleteSelected}>Delete selected item</button>
      </div>
      <div ref={mapContainerRef} className="map" />
      <div className="calculation-box">
        <div><strong>Area</strong></div>
        <div>{areaInfo.sqm > 0 ? `${areaInfo.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m²` : "—"}</div>
        <div>{areaInfo.sqft > 0 ? `${areaInfo.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²` : "—"}</div>
      </div>

      <aside className="form-panel">
        <div className="stepper">
          <div className={`step ${currentStep === 1 ? "active" : ""}`}>1</div>
          <div className={`step ${currentStep === 2 ? "active" : ""}`}>2</div>
          <div className={`step ${currentStep === 3 ? "active" : ""}`}>3</div>
        </div>

        {currentStep === 1 && (
          <div className="step-content">
            <h3>Select roof area</h3>
            <div className="instructions">
              <div className="instruction-step">
                <span className="step-number">1</span>
                <span>Search for an address in the USA</span>
              </div>
              <div className="instruction-step">
                <span className="step-number">2</span>
                <span>Click &quot;Draw new roof shape&quot; button 2</span>
              </div>
              <div className="instruction-step">
                <span className="step-number">3</span>
                <span>Click on the map to draw around the roof area</span>
              </div>
              <div className="instruction-step">
                <span className="step-number">4</span>
                <span>Double-click to finish drawing</span>
              </div>
            </div>
            
            {isDrawingMode && (
              <div className="drawing-mode-indicator">
                <div className="pulse-dot"></div>
                <span>Drawing mode active - Click on the map to start drawing</span>
              </div>
            )}
            
            <div className="summary">
              <div><strong>Address</strong></div>
              <div>{address || "—"}</div>
            </div>
            {addressError && <div className="error-message">{addressError}</div>}
            <div className="summary">
              <div><strong>Area</strong></div>
              <div>{areaInfo.sqm > 0 ? `${areaInfo.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m² (${areaInfo.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)` : "—"}</div>
            </div>
            <div className="actions">
              <button onClick={addCurrentRoofArea} disabled={!address || areaInfo.sqm <= 0 || addressError}>Add roof area</button>
              <button className="primary" onClick={goNext} disabled={roofAreas.length === 0}>Next</button>
            </div>

            {roofAreas.length > 0 && (
              <div className="sites-list">
                <div className="sites-header">
                  <strong>Roof areas for: {address}</strong>
                  <div className="total-area">
                    Total: {roofAreas.reduce((sum, area) => sum + area.sqm, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} m² 
                    ({roofAreas.reduce((sum, area) => sum + area.sqft, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)
                  </div>
                </div>
                {roofAreas.map((area, index) => (
                  <div key={area.id} className="site-item">
                    <div className="site-main">
                      <div className="site-address">Roof Area #{index + 1}</div>
                      <div className="site-area">{`${area.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m² (${area.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)`}</div>
                    </div>
                    <div className="site-actions">
                      <button onClick={() => removeRoofArea(area.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <form className="step-content" onSubmit={(e) => { e.preventDefault(); goNext(); }}>
            <h3>Your details</h3>
            <label>
              <span>Name</span>
              <input name="name" value={formValues.name} onChange={handleChange} placeholder="John Doe" />
              {formErrors.name && <em className="error">{formErrors.name}</em>}
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" value={formValues.phone} onChange={handleChange} placeholder="(555) 123-4567" />
              {formErrors.phone && <em className="error">{formErrors.phone}</em>}
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" value={formValues.email} onChange={handleChange} placeholder="you@example.com" />
              {formErrors.email && <em className="error">{formErrors.email}</em>}
            </label>
            <div className="actions">
              <button type="button" onClick={goBack}>Back</button>
              <button type="submit" className="primary">Next</button>
            </div>
          </form>
        )}

        {currentStep === 3 && (
          <div className="step-content">
            <h3>Review</h3>
            <div className="summary">
              <div><strong>Address</strong></div>
              <div>{address || "—"}</div>
            </div>
            {roofAreas.length > 0 ? (
              <div className="sites-list">
                <div className="sites-header">
                  <strong>Roof Areas ({roofAreas.length} total)</strong>
                  <div className="total-area">
                    Total: {roofAreas.reduce((sum, area) => sum + area.sqm, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} m² 
                    ({roofAreas.reduce((sum, area) => sum + area.sqft, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)
                  </div>
                </div>
                {roofAreas.map((area, index) => (
                  <div key={area.id} className="site-item">
                    <div className="site-main">
                      <div className="site-address">Roof Area #{index + 1}</div>
                      <div className="site-area">{`${area.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m² (${area.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)`}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="summary"><div>No roof areas added</div></div>
            )}
            <div className="summary">
              <div><strong>Name</strong></div>
              <div>{formValues.name}</div>
            </div>
            <div className="summary">
              <div><strong>Phone</strong></div>
              <div>{formValues.phone}</div>
            </div>
            <div className="summary">
              <div><strong>Email</strong></div>
              <div>{formValues.email}</div>
            </div>
            <div className="actions">
              <button onClick={goBack}>Back</button>
              <button className="primary" onClick={handleSubmit}>Submit</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
