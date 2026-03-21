"use client";

import { useEffect, useRef, useState } from "react";

type SelectableStore = {
    storeId: string;
    storeName: string;
    storeCode: string;
    city?: string;
    state?: string;
    latitude: number;
    longitude: number;
};

type DrawMode = "rectangle" | "circle" | "polygon" | null;
type MapPoint = [number, number];
type OverlayShape =
    | { kind: "rectangle"; bounds: [MapPoint, MapPoint] }
    | { kind: "circle"; center: MapPoint; radiusMeters: number }
    | { kind: "polygon"; points: MapPoint[] }
    | null;

type CampaignStoreSelectionMapProps = {
    stores: SelectableStore[];
    selectedStoreIds: string[];
    onSelectionChange: (storeIds: string[]) => void;
};

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletFeatureGroup = import("leaflet").FeatureGroup;

const DEFAULT_CENTER: MapPoint = [19.4326, -99.1332];
const DEFAULT_ZOOM = 10;

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

const isPointInsidePolygon = (point: MapPoint, polygon: MapPoint[]) => {
    let inside = false;
    const [lat, lng] = point;

    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const [latA, lngA] = polygon[index]!;
        const [latB, lngB] = polygon[previous]!;
        const intersects =
            lngA > lng !== lngB > lng &&
            lat < ((latB - latA) * (lng - lngA)) / (lngB - lngA || Number.EPSILON) + latA;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
};

const normalizeRectangleBounds = (first: MapPoint, second: MapPoint): [MapPoint, MapPoint] => [
    [Math.min(first[0], second[0]), Math.min(first[1], second[1])],
    [Math.max(first[0], second[0]), Math.max(first[1], second[1])],
];

export function CampaignStoreSelectionMap({
    stores,
    selectedStoreIds,
    onSelectionChange,
}: CampaignStoreSelectionMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const leafletRef = useRef<LeafletModule | null>(null);
    const markerLayerRef = useRef<LeafletFeatureGroup | null>(null);
    const overlayLayerRef = useRef<LeafletFeatureGroup | null>(null);
    const draftLayerRef = useRef<LeafletFeatureGroup | null>(null);
    const storesRef = useRef(stores);
    const selectedStoreIdsRef = useRef(selectedStoreIds);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const drawModeRef = useRef<DrawMode>(null);
    const draftPointsRef = useRef<MapPoint[]>([]);

    const [mapReady, setMapReady] = useState(false);
    const [drawMode, setDrawMode] = useState<DrawMode>(null);
    const [draftPoints, setDraftPoints] = useState<MapPoint[]>([]);
    const [overlay, setOverlay] = useState<OverlayShape>(null);

    useEffect(() => {
        storesRef.current = stores;
    }, [stores]);

    useEffect(() => {
        selectedStoreIdsRef.current = selectedStoreIds;
    }, [selectedStoreIds]);

    useEffect(() => {
        onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);

    useEffect(() => {
        drawModeRef.current = drawMode;
    }, [drawMode]);

    useEffect(() => {
        draftPointsRef.current = draftPoints;
    }, [draftPoints]);

    const resetDraft = () => {
        draftPointsRef.current = [];
        setDraftPoints([]);
    };

    const appendSelection = (storeIds: string[]) => {
        onSelectionChangeRef.current(
            Array.from(new Set([...selectedStoreIdsRef.current, ...storeIds])),
        );
    };

    const completeRectangle = (first: MapPoint, second: MapPoint) => {
        const bounds = normalizeRectangleBounds(first, second);
        const insideIds = storesRef.current
            .filter(
                (store) =>
                    store.latitude >= bounds[0][0] &&
                    store.latitude <= bounds[1][0] &&
                    store.longitude >= bounds[0][1] &&
                    store.longitude <= bounds[1][1],
            )
            .map((store) => store.storeId);

        setOverlay({ kind: "rectangle", bounds });
        appendSelection(insideIds);
    };

    const completeCircle = (center: MapPoint, edgePoint: MapPoint) => {
        const L = leafletRef.current;
        const map = mapRef.current;

        if (!L || !map) {
            return;
        }

        const radiusMeters = map.distance(L.latLng(center[0], center[1]), L.latLng(edgePoint[0], edgePoint[1]));
        const insideIds = storesRef.current
            .filter(
                (store) =>
                    map.distance(L.latLng(center[0], center[1]), L.latLng(store.latitude, store.longitude)) <=
                    radiusMeters,
            )
            .map((store) => store.storeId);

        setOverlay({ kind: "circle", center, radiusMeters });
        appendSelection(insideIds);
    };

    const completePolygon = (points: MapPoint[]) => {
        if (points.length < 3) {
            return;
        }

        const insideIds = storesRef.current
            .filter((store) => isPointInsidePolygon([store.latitude, store.longitude], points))
            .map((store) => store.storeId);

        setOverlay({ kind: "polygon", points });
        appendSelection(insideIds);
    };

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};

        void import("leaflet").then((leaflet) => {
            if (cancelled || !containerRef.current || mapRef.current) {
                return;
            }

            const L = leaflet.default ?? leaflet;
            leafletRef.current = L;

            const map = L.map(containerRef.current, {
                center: DEFAULT_CENTER,
                zoom: DEFAULT_ZOOM,
                zoomControl: false,
                scrollWheelZoom: true,
                doubleClickZoom: false,
            });
            mapRef.current = map;

            const syncViewport = () => {
                map.invalidateSize({ animate: false });
                map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
                setMapReady(true);
            };

            let frameId = 0;
            let nestedFrameId = 0;
            frameId = requestAnimationFrame(() => {
                nestedFrameId = requestAnimationFrame(syncViewport);
            });

            const resizeObserver = new ResizeObserver(() => {
                map.invalidateSize({ animate: false });
            });

            resizeObserver.observe(containerRef.current);

            L.control.zoom({ position: "bottomright" }).addTo(map);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            const markerLayer = L.featureGroup();
            const overlayLayer = L.featureGroup();
            const draftLayer = L.featureGroup();

            markerLayer.addTo(map);
            overlayLayer.addTo(map);
            draftLayer.addTo(map);

            markerLayerRef.current = markerLayer;
            overlayLayerRef.current = overlayLayer;
            draftLayerRef.current = draftLayer;

            const handleClick = (event: { latlng: { lat: number; lng: number } }) => {
                const activeMode = drawModeRef.current;

                if (!activeMode) {
                    return;
                }

                const nextPoint: MapPoint = [event.latlng.lat, event.latlng.lng];
                const currentDraft = draftPointsRef.current;

                if (activeMode === "rectangle") {
                    if (currentDraft.length === 0) {
                        setDraftPoints([nextPoint]);
                        return;
                    }

                    completeRectangle(currentDraft[0]!, nextPoint);
                    resetDraft();
                    setDrawMode(null);
                    return;
                }

                if (activeMode === "circle") {
                    if (currentDraft.length === 0) {
                        setDraftPoints([nextPoint]);
                        return;
                    }

                    completeCircle(currentDraft[0]!, nextPoint);
                    resetDraft();
                    setDrawMode(null);
                    return;
                }

                setDraftPoints([...currentDraft, nextPoint]);
            };

            map.on("click", handleClick);

            cleanup = () => {
                cancelAnimationFrame(frameId);
                cancelAnimationFrame(nestedFrameId);
                resizeObserver.disconnect();
                map.off("click", handleClick);
                markerLayer.clearLayers();
                overlayLayer.clearLayers();
                draftLayer.clearLayers();
                map.remove();
                markerLayerRef.current = null;
                overlayLayerRef.current = null;
                draftLayerRef.current = null;
                mapRef.current = null;
                leafletRef.current = null;
                setMapReady(false);
            };
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, []);

    useEffect(() => {
        const L = leafletRef.current;
        const markerLayer = markerLayerRef.current;

        if (!L || !markerLayer || !mapReady) {
            return;
        }

        markerLayer.clearLayers();

        stores.forEach((store, index) => {
            const isSelected = selectedStoreIds.includes(store.storeId);
            const marker = L.marker([store.latitude, store.longitude], {
                icon: L.divIcon({
                    className: "cpg-store-marker-shell",
                    html: `<span class="cpg-store-marker${isSelected ? " is-selected" : ""}">${index + 1}</span>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                }),
            });

            marker.bindPopup(
                `<div class="space-y-1">
                    <p style="font-weight:600">${escapeHtml(store.storeName)}</p>
                    <p style="font-size:12px;color:#52525b">${escapeHtml(store.storeCode)}</p>
                    <p style="font-size:12px;color:#71717a">${escapeHtml(
                        [store.city, store.state].filter(Boolean).join(", ") ||
                            "Sin ubicación textual",
                    )}</p>
                </div>`,
            );
            marker.addTo(markerLayer);
        });
    }, [mapReady, selectedStoreIds, stores]);

    useEffect(() => {
        const L = leafletRef.current;
        const overlayLayer = overlayLayerRef.current;

        if (!L || !overlayLayer || !mapReady) {
            return;
        }

        overlayLayer.clearLayers();

        if (!overlay) {
            return;
        }

        if (overlay.kind === "rectangle") {
            L.rectangle(overlay.bounds, {
                color: "#0f766e",
                weight: 2,
                fillColor: "#14b8a6",
                fillOpacity: 0.14,
                dashArray: "8 6",
            }).addTo(overlayLayer);
            return;
        }

        if (overlay.kind === "circle") {
            L.circle(overlay.center, {
                radius: overlay.radiusMeters,
                color: "#0f766e",
                weight: 2,
                fillColor: "#14b8a6",
                fillOpacity: 0.14,
                dashArray: "8 6",
            }).addTo(overlayLayer);
            return;
        }

        L.polygon(overlay.points, {
            color: "#0f766e",
            weight: 2,
            fillColor: "#14b8a6",
            fillOpacity: 0.16,
            dashArray: "8 6",
        }).addTo(overlayLayer);
    }, [mapReady, overlay]);

    useEffect(() => {
        const L = leafletRef.current;
        const draftLayer = draftLayerRef.current;

        if (!L || !draftLayer || !mapReady) {
            return;
        }

        draftLayer.clearLayers();

        if (draftPoints.length === 0) {
            return;
        }

        draftPoints.forEach((point, index) => {
            L.circleMarker(point, {
                radius: 7,
                color: "#0f766e",
                weight: 2,
                fillColor: "#2dd4bf",
                fillOpacity: 0.8,
            })
                .bindTooltip(String(index + 1), {
                    direction: "top",
                    offset: [0, -8],
                })
                .addTo(draftLayer);
        });

        if (drawMode === "polygon" && draftPoints.length >= 2) {
            L.polyline(draftPoints, {
                color: "#0f766e",
                weight: 2,
                dashArray: "6 6",
            }).addTo(draftLayer);
        }
    }, [draftPoints, drawMode, mapReady]);

    const activateMode = (mode: Exclude<DrawMode, null>) => {
        if (drawMode === mode) {
            resetDraft();
            setDrawMode(null);
            return;
        }

        resetDraft();
        setDrawMode(mode);
    };

    const clearOverlay = () => {
        resetDraft();
        setDrawMode(null);
        setOverlay(null);
    };

    const finishPolygon = () => {
        if (draftPointsRef.current.length < 3) {
            return;
        }

        completePolygon(draftPointsRef.current);
        resetDraft();
        setDrawMode(null);
    };

    const helperText =
        drawMode === "rectangle"
            ? draftPoints.length === 0
                ? "Rectángulo: haz clic en la primera esquina."
                : "Rectángulo: marca la esquina opuesta para cerrar el área."
            : drawMode === "circle"
              ? draftPoints.length === 0
                  ? "Circular: haz clic en el centro."
                  : "Circular: haz clic en el borde para definir el radio."
              : drawMode === "polygon"
                ? draftPoints.length === 0
                    ? "Polígono: haz clic en el primer vértice."
                    : `Polígono: agrega más vértices. Llevas ${draftPoints.length}.`
                : "El mapa queda fijo al abrir. Usa el zoom y arrastre para posicionarte antes de dibujar.";

    const modeButtonClass = (mode: Exclude<DrawMode, null>) =>
        `rounded-full px-3 py-1.5 font-semibold transition ${
            drawMode === mode
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <p>
                    Navega el mapa libremente y luego elige cómo quieres delimitar el área de
                    selección.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => activateMode("rectangle")}
                        className={modeButtonClass("rectangle")}
                    >
                        Área rectangular
                    </button>
                    <button
                        type="button"
                        onClick={() => activateMode("circle")}
                        className={modeButtonClass("circle")}
                    >
                        Área circular
                    </button>
                    <button
                        type="button"
                        onClick={() => activateMode("polygon")}
                        className={modeButtonClass("polygon")}
                    >
                        Área multi-puntos
                    </button>
                    <button
                        type="button"
                        onClick={() => mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM)}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        Centrar CDMX
                    </button>
                    {(draftPoints.length > 0 || overlay) && (
                        <button
                            type="button"
                            onClick={clearOverlay}
                            className="rounded-full border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            Limpiar área
                        </button>
                    )}
                    {drawMode === "polygon" && draftPoints.length >= 3 && (
                        <button
                            type="button"
                            onClick={finishPolygon}
                            className="rounded-full bg-zinc-900 px-3 py-1.5 font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                            Cerrar polígono
                        </button>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-950/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                {helperText}
            </div>

            <div
                className={`h-[360px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 ${
                    drawMode ? "cursor-crosshair" : ""
                }`}
            >
                <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            </div>
        </div>
    );
}
