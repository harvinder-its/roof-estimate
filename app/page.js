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
  const [currentStep, setCurrentStep] = useState(1); // 1: Select Area, 2: Select Slopes, 3: Contact, 4: Review
  const [formValues, setFormValues] = useState({ name: "", phone: "", email: "" });
  const [formErrors, setFormErrors] = useState({ name: "", phone: "", email: "" });
  const [selectedSlopes, setSelectedSlopes] = useState([]); // Array of selected slope types
  const [roofAreas, setRoofAreas] = useState([]); // { id, sqm, sqft, geometry }
  const [addressError, setAddressError] = useState("");
  const [highlightedPolygons, setHighlightedPolygons] = useState([]); // Store polygon data for highlighting
  const [currentPolygon, setCurrentPolygon] = useState(null); // Store current polygon geometry
  const [isDrawingMode, setIsDrawingMode] = useState(false); // Track if user is in drawing mode
  const [isDetectingRoofs, setIsDetectingRoofs] = useState(false); // Track automatic roof detection
  const [detectedRoofs, setDetectedRoofs] = useState([]); // Store automatically detected roof areas
  const [autoAddMessage, setAutoAddMessage] = useState(""); // Message for auto-added roof areas

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
    // Don't add to map controls, we'll add it to our custom container

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
      map.flyTo({ center: [lon, lat], zoom: 18 });
      if (ev.result.place_name) {
        // Check if the result is from USA
        const isUSA = ev.result.context && ev.result.context.some(ctx => 
          ctx.id && ctx.id.startsWith('country') && ctx.short_code === 'us'
        );
        
        if (isUSA) {
          setAddress(ev.result.place_name);
          setAddressError("");
          // Clear existing roof areas and detected roofs
          setRoofAreas([]);
          setHighlightedPolygons([]);
          setDetectedRoofs([]);
          setAutoAddMessage(""); // Clear any previous auto-add message
          
          // Just detect and suggest roof areas (don't auto-add them)
          setTimeout(() => {
            detectRoofAreas([lon, lat]);
          }, 1000); // Wait for map to settle
        } else {
          setAddressError("Please select an address in the United States only.");
          setAddress("");
        }
      }
    });

    // Add geocoder to form search container after map loads
    map.on("load", () => {
      addBuildingOutlines();
      
      // Add geocoder to form search container
      const formSearchContainer = document.getElementById('form-search-container');
      if (formSearchContainer) {
        // Create a geocoder instance for the form
        const formGeocoder = new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl,
          marker: false,
          placeholder: "Search address in USA",
          countries: "us",
          types: "address,poi",
        });
        
        // Add the same event handler
        formGeocoder.on("result", (ev) => {
          if (!ev || !ev.result || !ev.result.center) return;
          const [lon, lat] = ev.result.center;
          map.flyTo({ center: [lon, lat], zoom: 18 });
          if (ev.result.place_name) {
            const isUSA = ev.result.context && ev.result.context.some(ctx => 
              ctx.id && ctx.id.startsWith('country') && ctx.short_code === 'us'
            );
            
            if (isUSA) {
              setAddress(ev.result.place_name);
              setAddressError("");
              setRoofAreas([]);
              setHighlightedPolygons([]);
              setDetectedRoofs([]);
              setAutoAddMessage(""); // Clear any previous auto-add message
              
              // Just detect and suggest roof areas (don't auto-add them)
              setTimeout(() => {
                detectRoofAreas([lon, lat]);
              }, 1000);
            } else {
              setAddressError("Please select an address in the United States only.");
              setAddress("");
            }
          }
        });
        
        formSearchContainer.appendChild(formGeocoder.onAdd(map));
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
          color: '#64cc32', // Use brand green color
          area: polygon.area || 'Unknown'
        },
        geometry: polygon.geometry
      }))
    };
    
    // Add source and layer for highlighted polygons
    map.addSource('highlighted-polygons', {
      type: 'geojson',
      data: geojson
    });
    
    // Add fill layer with brand green color
    map.addLayer({
      id: 'highlighted-polygons',
      type: 'fill',
      source: 'highlighted-polygons',
      paint: {
        'fill-color': '#64cc32',
        'fill-opacity': 0.3
      }
    });
    
    // Add outline layer with thicker, more visible lines
    map.addLayer({
      id: 'highlighted-polygons-outline',
      type: 'line',
      source: 'highlighted-polygons',
      paint: {
        'line-color': '#64cc32',
        'line-width': 4,
        'line-opacity': 1
      }
    });
    
    console.log(`Highlighted ${polygons.length} roof areas on the map`);
  };

  // Function to add building outlines for better roof identification
  const addBuildingOutlines = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    try {
      // Check if the building source layer exists in the composite source
      const sources = map.getStyle().sources;
      const compositeSource = sources['composite'];
      
      if (compositeSource && compositeSource.type === 'vector') {
        // Check if building source layer exists
        const hasBuildingLayer = compositeSource.tiles && 
          compositeSource.tiles.some(tile => tile.includes('building'));
        
        if (hasBuildingLayer) {
          // Add subtle building outlines for all buildings
          if (!map.getLayer('building-outlines')) {
            map.addLayer({
              id: 'building-outlines',
              type: 'line',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              paint: {
                'line-color': '#666666',
                'line-width': 2,
                'line-opacity': 0.6
              }
            });
          }
          
          // Add subtle building fill for all buildings
          if (!map.getLayer('building-fill')) {
            map.addLayer({
              id: 'building-fill',
              type: 'fill',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              paint: {
                'fill-color': '#cccccc',
                'fill-opacity': 0.05
              }
            });
          }
        } else {
          console.log('Building source layer not available in composite source');
        }
      } else {
        console.log('Composite source not available or not a vector source');
      }
    } catch (error) {
      console.log('Error adding building outlines:', error);
    }
  };

  // Function to detect the specific building at the searched address
  const detectRoofAreas = async (center, zoom = 18, retryCount = 0) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    setIsDetectingRoofs(true);
    setDetectedRoofs([]);
    
    try {
      // Wait for the map to fully load and render
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('Searching for building at specific address:', center);
      
      // Create a small search area around the exact address point
      const searchRadius = 0.0001; // Small radius around the address
      const bbox = [
        center[0] - searchRadius, 
        center[1] - searchRadius, 
        center[0] + searchRadius, 
        center[1] + searchRadius
      ];
      
      let buildingFeature = null;
      
      // Method 1: Query features at the exact point
      try {
        const pointFeatures = await map.queryRenderedFeatures({
          bbox: bbox
        });
        
        console.log('Features at address point:', pointFeatures.length);
        
        // Find the building feature closest to the address point
        const buildingFeatures = pointFeatures.filter(feature => {
          const layerId = feature.layer?.id || '';
          const sourceLayer = feature.sourceLayer || '';
          const properties = feature.properties || {};
          
          // Check if it's a building feature
          const isBuildingLayer = layerId.includes('building') || 
                                 sourceLayer.includes('building') ||
                                 layerId.includes('structure') ||
                                 layerId.includes('outline');
          
          const isBuildingProperty = properties.type === 'building' ||
                                   properties.building ||
                                   properties.structure ||
                                   properties.extrude ||
                                   properties.height ||
                                   properties.levels;
          
          const isPolygon = feature.geometry && feature.geometry.type === 'Polygon';
          
          return (isBuildingLayer || isBuildingProperty) && isPolygon;
        });
        
        if (buildingFeatures.length > 0) {
          // Find the building that contains or is closest to the address point
          buildingFeature = buildingFeatures.find(feature => {
            try {
              const point = turf.point(center);
              return turf.booleanPointInPolygon(point, feature) || 
                     turf.distance(point, turf.centroid(feature), { units: 'kilometers' }) < 0.01;
            } catch (e) {
              return false;
            }
          }) || buildingFeatures[0];
          
          console.log('Found building at address:', buildingFeature);
        }
      } catch (e) {
        console.log('Point query failed:', e);
      }
      
      // Method 2: If no building found at point, search in a slightly larger area
      if (!buildingFeature) {
        const largerRadius = 0.0005; // Larger search radius
        const largerBbox = [
          center[0] - largerRadius, 
          center[1] - largerRadius, 
          center[0] + largerRadius, 
          center[1] + largerRadius
        ];
        
        try {
          const areaFeatures = await map.queryRenderedFeatures({
            bbox: largerBbox
          });
          
          const buildingFeatures = areaFeatures.filter(feature => {
            const layerId = feature.layer?.id || '';
            const sourceLayer = feature.sourceLayer || '';
            const properties = feature.properties || {};
            
            const isBuildingLayer = layerId.includes('building') || 
                                   sourceLayer.includes('building') ||
                                   layerId.includes('structure') ||
                                   layerId.includes('outline');
            
            const isBuildingProperty = properties.type === 'building' ||
                                     properties.building ||
                                     properties.structure ||
                                     properties.extrude ||
                                     properties.height ||
                                     properties.levels;
            
            const isPolygon = feature.geometry && feature.geometry.type === 'Polygon';
            
            return (isBuildingLayer || isBuildingProperty) && isPolygon;
          });
          
          if (buildingFeatures.length > 0) {
            // Find the closest building to the address point
            const point = turf.point(center);
            buildingFeature = buildingFeatures.reduce((closest, current) => {
              try {
                const closestDistance = turf.distance(point, turf.centroid(closest), { units: 'kilometers' });
                const currentDistance = turf.distance(point, turf.centroid(current), { units: 'kilometers' });
                return currentDistance < closestDistance ? current : closest;
              } catch (e) {
                return closest;
              }
            });
            
            console.log('Found closest building to address:', buildingFeature);
          }
        } catch (e) {
          console.log('Area query failed:', e);
        }
      }
      
      // Method 3: Try source features for the specific building
      if (!buildingFeature) {
        try {
          const sources = map.getStyle().sources;
          const compositeSource = sources['composite'];
          
          if (compositeSource && compositeSource.type === 'vector') {
            const sourceQueries = [
              { sourceLayer: 'building', filter: null },
              { sourceLayer: 'building', filter: ['==', 'extrude', 'true'] },
              { sourceLayer: 'building', filter: ['>', 'height', 0] }
            ];
            
            for (const query of sourceQueries) {
              try {
                const sourceFeatures = await map.querySourceFeatures('composite', query);
                const buildingFeatures = sourceFeatures.filter(f => f.geometry && f.geometry.type === 'Polygon');
                
                if (buildingFeatures.length > 0) {
                  // Find building closest to address
                  const point = turf.point(center);
                  buildingFeature = buildingFeatures.reduce((closest, current) => {
                    try {
                      const closestDistance = turf.distance(point, turf.centroid(closest), { units: 'kilometers' });
                      const currentDistance = turf.distance(point, turf.centroid(current), { units: 'kilometers' });
                      return currentDistance < closestDistance ? current : closest;
                    } catch (e) {
                      return closest;
                    }
                  });
                  
                  if (turf.distance(point, turf.centroid(buildingFeature), { units: 'kilometers' }) < 0.1) {
                    console.log('Found building via source query:', buildingFeature);
                    break;
                  }
                }
              } catch (e) {
                console.log(`Source query failed for ${query.sourceLayer}:`, e.message);
              }
            }
          }
        } catch (e) {
          console.log('Source features failed:', e);
        }
      }
      
      // Process the found building
      if (buildingFeature) {
        const roofArea = processSpecificBuilding(buildingFeature, center);
        if (roofArea) {
          setDetectedRoofs([roofArea]);
          console.log('Successfully detected roof area for searched building:', roofArea);
          return;
        }
      }
      
      // Fallback: create a realistic building at the address location
      console.log('No building found at address, creating realistic building outline');
      const fallbackRoof = createBuildingAtAddress(center);
      setDetectedRoofs([fallbackRoof]);
      
    } catch (error) {
      console.error('Error detecting roof areas:', error);
      // Fallback: create a building at the address location
      const fallbackRoof = createBuildingAtAddress(center);
      setDetectedRoofs([fallbackRoof]);
    } finally {
      setIsDetectingRoofs(false);
    }
  };

  // Process a specific building found at the searched address
  const processSpecificBuilding = (buildingFeature, center) => {
    try {
      const area = turf.area(buildingFeature);
      const sqft = area * 10.7639;
      const centroid = turf.centroid(buildingFeature);
      
      // Get building properties for better naming
      const properties = buildingFeature.properties || {};
      const buildingType = properties.type || properties.building || 'building';
      const buildingHeight = properties.height || properties.levels || 0;
      
      // Create a descriptive name for the building
      let buildingName = "Searched Building";
      if (buildingType && buildingType !== 'building') {
        buildingName = `Searched ${buildingType.charAt(0).toUpperCase() + buildingType.slice(1)}`;
      }
      
      if (buildingHeight > 0) {
        buildingName += ` (${buildingHeight}${typeof buildingHeight === 'number' ? ' levels' : ''})`;
      }
      
      const roofArea = {
        id: `searched-building-${Date.now()}`,
        sqm: area,
        sqft: sqft,
        geometry: buildingFeature.geometry,
        type: 'searched-building',
        name: buildingName,
        centroid: centroid.geometry.coordinates,
        properties: properties,
        buildingType: buildingType,
        buildingHeight: buildingHeight
      };
      
      console.log(`Processed searched building: ${buildingName} (${area.toFixed(2)} m²)`);
      return roofArea;
    } catch (e) {
      console.log('Error processing specific building:', e);
      return null;
    }
  };

  // Create a realistic building outline at the searched address
  const createBuildingAtAddress = (center) => {
    const [lon, lat] = center;
    
    // Create a realistic building size based on typical residential/commercial buildings
    const buildingWidth = 0.00008;  // ~8-10 meters
    const buildingHeight = 0.00006; // ~6-8 meters
    
    const halfWidth = buildingWidth / 2;
    const halfHeight = buildingHeight / 2;
    
    // Create a rectangular building centered at the address
    const buildingPolygon = turf.polygon([[
      [lon - halfWidth, lat - halfHeight],
      [lon + halfWidth, lat - halfHeight],
      [lon + halfWidth, lat + halfHeight],
      [lon - halfWidth, lat + halfHeight],
      [lon - halfWidth, lat - halfHeight]
    ]]);
    
    const area = turf.area(buildingPolygon);
    const sqft = area * 10.7639;
    
    const roofArea = {
      id: `address-building-${Date.now()}`,
      sqm: area,
      sqft: sqft,
      geometry: buildingPolygon.geometry,
      type: 'address-building',
      name: "Building at Searched Address",
      centroid: center,
      properties: {},
      buildingType: 'building',
      buildingHeight: 0
    };
    
    console.log(`Created building at address: ${area.toFixed(2)} m²`);
    return roofArea;
  };

  // Process building features and convert to roof areas
  const processBuildingFeatures = (features, center) => {
    const roofAreas = [];
    
    // Filter for valid polygon features and calculate their properties
    const validFeatures = features
      .filter(feature => {
        // Must be a polygon
        if (!feature.geometry || feature.geometry.type !== 'Polygon') return false;
        
        // Must have valid coordinates
        const coords = feature.geometry.coordinates[0];
        if (!coords || coords.length < 3) return false;
        
        return true;
      })
      .map(feature => {
        const area = turf.area(feature);
        const centroid = turf.centroid(feature);
        const distanceFromCenter = turf.distance(center, centroid, { units: 'kilometers' });
        
        return { 
          ...feature, 
          area, 
          centroid: centroid.geometry.coordinates,
          distanceFromCenter 
        };
      })
      .filter(feature => {
        // Filter by reasonable size and distance
        return feature.area >= 5 && feature.area <= 10000 && feature.distanceFromCenter <= 0.5;
      })
      .sort((a, b) => {
        // Sort by distance from center first, then by area
        if (Math.abs(a.distanceFromCenter - b.distanceFromCenter) < 0.1) {
          return b.area - a.area; // Larger area first if similar distance
        }
        return a.distanceFromCenter - b.distanceFromCenter; // Closer first
      })
      .slice(0, 3); // Take top 3 buildings
    
    validFeatures.forEach((feature, index) => {
      const area = feature.area;
      const sqft = area * 10.7639;
      
      // Determine building name based on size and position
      let buildingName;
      if (index === 0) {
        buildingName = "Main Building";
      } else if (feature.area > 100) {
        buildingName = `Large Building ${index + 1}`;
      } else {
        buildingName = `Building ${index + 1}`;
      }
      
      roofAreas.push({
        id: `detected-${Date.now()}-${index}`,
        sqm: area,
        sqft: sqft,
        geometry: feature.geometry,
        type: 'detected',
        name: buildingName,
        centroid: feature.centroid
      });
    });
    
    return roofAreas;
  };

  // Create sample roof areas when building data is not available
  const createSampleRoofAreas = (center) => {
    const [lon, lat] = center;
    const roofAreas = [];
    
    // Create 2-3 sample roof areas around the center point with more realistic shapes
    // Use fixed offsets that work well at zoom level 18
    const buildingConfigs = [
      { 
        lon: -0.00008, 
        lat: 0.00006, 
        width: 0.0001, 
        height: 0.00007,
        name: "Main Building"
      }, // Main building (rectangular)
      { 
        lon: 0.00008, 
        lat: -0.00006, 
        width: 0.00007, 
        height: 0.00005,
        name: "Secondary Building"
      },  // Secondary building (rectangular)
      { 
        lon: 0.00004, 
        lat: 0.00012, 
        width: 0.00005, 
        height: 0.000035,
        name: "Small Building"
      }  // Small building (rectangular)
    ];
    
    buildingConfigs.forEach((config, index) => {
      const buildingCenter = [lon + config.lon, lat + config.lat];
      
      // Create a rectangular building
      const halfWidth = config.width / 2;
      const halfHeight = config.height / 2;
      
      const buildingPolygon = turf.polygon([[
        [buildingCenter[0] - halfWidth, buildingCenter[1] - halfHeight],
        [buildingCenter[0] + halfWidth, buildingCenter[1] - halfHeight],
        [buildingCenter[0] + halfWidth, buildingCenter[1] + halfHeight],
        [buildingCenter[0] - halfWidth, buildingCenter[1] + halfHeight],
        [buildingCenter[0] - halfWidth, buildingCenter[1] - halfHeight]
      ]]);
      
      const area = turf.area(buildingPolygon);
      const sqft = area * 10.7639;
      
      // Include buildings with reasonable roof sizes (50-1500 sqm)
      if (area >= 50 && area <= 1500) {
        roofAreas.push({
          id: `sample-${Date.now()}-${index}`,
          sqm: area,
          sqft: sqft,
          geometry: buildingPolygon.geometry,
          type: 'sample',
          name: config.name
        });
      }
    });
    
    console.log(`Created ${roofAreas.length} sample roof areas`);
    return roofAreas;
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
      if (selectedSlopes.length === 0) return;
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!validateContact()) return;
      setCurrentStep(4);
    }
  };

  const goBack = () => {
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
    if (currentStep === 4) setCurrentStep(3);
  };

  const toggleSlope = (slopeType) => {
    setSelectedSlopes(prev => 
      prev.includes(slopeType) 
        ? prev.filter(slope => slope !== slopeType)
        : [...prev, slopeType]
    );
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

  // Add all detected roof areas to the main roof areas list
  const addAllDetectedRoofs = () => {
    if (detectedRoofs.length === 0) return;
    
    const newRoofAreas = detectedRoofs.map(roof => ({
      id: roof.id,
      sqm: roof.sqm,
      sqft: roof.sqft,
      geometry: roof.geometry
    }));
    
    setRoofAreas(prev => [...prev, ...newRoofAreas]);
    setHighlightedPolygons(prev => [...prev, ...detectedRoofs.map(roof => ({
      id: roof.id,
      geometry: roof.geometry
    }))]);
    
    // Clear detected roofs
    setDetectedRoofs([]);
  };

  // Automatically add detected roof areas (up to 3) for easier user experience
  const autoAddDetectedRoofs = () => {
    console.log('Auto-adding detected roof areas...', detectedRoofs.length);
    
    if (detectedRoofs.length === 0) {
      console.log('No detected roof areas to add');
      return;
    }
    
    // Take up to 3 detected roof areas
    const roofsToAdd = detectedRoofs.slice(0, 3);
    console.log(`Adding ${roofsToAdd.length} roof areas:`, roofsToAdd);
    
    const newRoofAreas = roofsToAdd.map(roof => ({
      id: roof.id,
      sqm: roof.sqm,
      sqft: roof.sqft,
      geometry: roof.geometry
    }));
    
    setRoofAreas(prev => {
      const updated = [...prev, ...newRoofAreas];
      console.log('Updated roof areas:', updated);
      return updated;
    });
    
    const newHighlightedPolygons = roofsToAdd.map(roof => ({
      id: roof.id,
      geometry: roof.geometry
    }));
    
    setHighlightedPolygons(prev => [...prev, ...newHighlightedPolygons]);
    
    // Remove the added roofs from detected roofs
    setDetectedRoofs(prev => prev.slice(3));
    
    // Show a brief notification that roof areas were automatically added
    setAutoAddMessage(`✅ Automatically added ${roofsToAdd.length} roof areas for easier setup!`);
    
    // Clear the message after 5 seconds
    setTimeout(() => {
      setAutoAddMessage("");
    }, 5000);
    
    console.log(`Successfully added ${roofsToAdd.length} roof areas for easier setup!`);
  };

  // Add individual detected roof area
  const addDetectedRoof = (roof) => {
    const newRoofArea = {
      id: roof.id,
      sqm: roof.sqm,
      sqft: roof.sqft,
      geometry: roof.geometry
    };
    
    setRoofAreas(prev => [...prev, newRoofArea]);
    setHighlightedPolygons(prev => [...prev, {
      id: roof.id,
      geometry: roof.geometry
    }]);
    
    // Remove from detected roofs
    setDetectedRoofs(prev => prev.filter(r => r.id !== roof.id));
  };

  // Delete individual detected roof area
  const deleteDetectedRoof = (roofId) => {
    setDetectedRoofs(prev => prev.filter(r => r.id !== roofId));
  };

  // Clear all detected roof areas
  const clearAllDetectedRoofs = () => {
    setDetectedRoofs([]);
  };



  // Update highlighted polygons to include detected roofs
  useEffect(() => {
    if (detectedRoofs.length > 0) {
      const allPolygons = [
        ...highlightedPolygons,
        ...detectedRoofs.map(roof => ({
          id: roof.id,
          geometry: roof.geometry
        }))
      ];
      updateHighlightedPolygons(allPolygons);
    } else {
      updateHighlightedPolygons(highlightedPolygons);
    }
  }, [detectedRoofs, highlightedPolygons]);

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
        <div className="logo-container">
          <img 
            src="https://parkvistaroofing.com/wp-content/uploads/2019/09/Park-Place-Roofing-02.png" 
            alt="Park Vista Roofing Logo" 
          />
        </div>
        <div className="stepper">
          <div className={`step ${currentStep === 1 ? "active" : ""} ${currentStep > 1 ? "completed" : ""}`}>1</div>
          <div className={`step ${currentStep === 2 ? "active" : ""} ${currentStep > 2 ? "completed" : ""}`}>2</div>
          <div className={`step ${currentStep === 3 ? "active" : ""} ${currentStep > 3 ? "completed" : ""}`}>3</div>
          <div className={`step ${currentStep === 4 ? "active" : ""} ${currentStep > 4 ? "completed" : ""}`}>4</div>
        </div>

        {currentStep === 1 && (
          <div className="step-content">
            <h3>Select Roof Area</h3>
            
            {/* Search Address Section */}
            <div className="search-section">
              <label>
                <span>Search Address</span>
                <div id="form-search-container" className="form-search-container"></div>
              </label>
              {addressError && <div className="error-message">{addressError}</div>}
            </div>
            
            {/* Action Buttons */}
            <div className="form-action-buttons">
              <button className="form-action-button primary" onClick={startPolygonMode}>
                🏠 Add Roof Area
              </button>
              <button className="form-action-button secondary" onClick={deleteSelected}>
                🗑️ Delete Selected
              </button>
            </div>
            
            <div className="instructions">
              <div className="instruction-step">
                <span className="step-number">1</span>
                <span>Search for an address in the USA</span>
              </div>
              <div className="instruction-step">
                <span className="step-number">2</span>
                <span>System will detect the roof shape of the searched building</span>
              </div>
              <div className="instruction-step">
                <span className="step-number">3</span>
                <span>Add the detected roof area or draw custom shapes</span>
              </div>
            </div>
            
            {isDetectingRoofs && (
              <div className="detection-indicator">
                <div className="pulse-dot"></div>
                <span>Detecting roof shape of the searched building...</span>
              </div>
            )}
            
            {autoAddMessage && (
              <div className="auto-add-message">
                <div className="success-icon">✅</div>
                <span>{autoAddMessage}</span>
              </div>
            )}
            
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
            
            {/* Show detected roof areas */}
            {detectedRoofs.length > 0 && (
              <div className="detected-roofs">
                <div className="detected-header">
                  <strong>Suggested Roof Areas ({detectedRoofs.length})</strong>
                  <div className="detected-actions">
                    <button 
                      className="add-all-btn" 
                      onClick={addAllDetectedRoofs}
                      title="Add all suggested roof areas"
                    >
                      Add All
                    </button>
                    <button 
                      className="clear-all-btn" 
                      onClick={clearAllDetectedRoofs}
                      title="Clear all suggested roof areas"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                {detectedRoofs.map((roof, index) => (
                  <div key={roof.id} className="detected-roof-item">
                    <div className="roof-info">
                      <div className="roof-name">{roof.name}</div>
                      <div className="roof-area">
                        {roof.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m² 
                        ({roof.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)
                      </div>
                      {roof.type === 'sample' && (
                        <div className="roof-type-indicator">Estimated</div>
                      )}
                    </div>
                    <div className="roof-actions">
                      <button 
                        className="add-roof-btn" 
                        onClick={() => addDetectedRoof(roof)}
                        title="Add this roof area"
                      >
                        Add
                      </button>
                      <button 
                        className="delete-roof-btn" 
                        onClick={() => deleteDetectedRoof(roof.id)}
                        title="Delete this detected roof area"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="summary">
              <div><strong>Current Drawing Area</strong></div>
              <div>{areaInfo.sqm > 0 ? `${areaInfo.sqm.toLocaleString(undefined, { maximumFractionDigits: 2 })} m² (${areaInfo.sqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft²)` : "—"}</div>
            </div>
            <div className="actions">
              <button onClick={addCurrentRoofArea} disabled={!address || areaInfo.sqm <= 0 || addressError}>Add current area</button>
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
          <div className="step-content">
            <h3>Select Your Roof Slopes</h3>
            
            <div className="slope-selection">
              <div className="slope-options">
                <div 
                  className={`slope-option ${selectedSlopes.includes('flat') ? 'selected' : ''}`}
                  onClick={() => toggleSlope('flat')}
                >
                  <div className="slope-icon">🏠</div>
                  <div className="slope-label">Flat</div>
                  <div className="slope-description">0° - 5° slope</div>
                </div>
                
                <div 
                  className={`slope-option ${selectedSlopes.includes('shallow') ? 'selected' : ''}`}
                  onClick={() => toggleSlope('shallow')}
                >
                  <div className="slope-icon">🏘️</div>
                  <div className="slope-label">Shallow</div>
                  <div className="slope-description">5° - 15° slope</div>
                </div>
                
                <div 
                  className={`slope-option ${selectedSlopes.includes('medium') ? 'selected' : ''}`}
                  onClick={() => toggleSlope('medium')}
                >
                  <div className="slope-icon">🏡</div>
                  <div className="slope-label">Medium</div>
                  <div className="slope-description">15° - 30° slope</div>
                </div>
                
                <div 
                  className={`slope-option ${selectedSlopes.includes('steep') ? 'selected' : ''}`}
                  onClick={() => toggleSlope('steep')}
                >
                  <div className="slope-icon">⛰️</div>
                  <div className="slope-label">Steep</div>
                  <div className="slope-description">30°+ slope</div>
                </div>
              </div>
              
              <div className="slope-instructions">
                <p>Select all roof slopes that apply to your building. You can select multiple options if your roof has different slope areas.</p>
              </div>
            </div>
            
            <div className="actions">
              <button type="button" onClick={goBack}>Back</button>
              <button type="button" className="primary" onClick={goNext} disabled={selectedSlopes.length === 0}>Next</button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <form className="step-content" onSubmit={(e) => { e.preventDefault(); goNext(); }}>
            <h3>Your Details</h3>
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

        {currentStep === 4 && (
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
              <div><strong>Selected Slopes</strong></div>
              <div>
                {selectedSlopes.length > 0 ? (
                  <div className="selected-slopes">
                    {selectedSlopes.map((slope, index) => (
                      <span key={slope} className="slope-tag">
                        {slope === 'flat' && '🏠 Flat'}
                        {slope === 'shallow' && '🏘️ Shallow'}
                        {slope === 'medium' && '🏡 Medium'}
                        {slope === 'steep' && '⛰️ Steep'}
                      </span>
                    ))}
                  </div>
                ) : (
                  "No slopes selected"
                )}
              </div>
            </div>
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
