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

type RectangleBounds = [[number, number], [number, number]] | null;

type CampaignStoreSelectionMapProps = {
    stores: SelectableStore[];
    selectedStoreIds: string[];
    onSelectionChange: (storeIds: string[]) => void;
    rectangleBounds: RectangleBounds;
    onRectangleBoundsChange: (bounds: RectangleBounds) => void;
};

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletRectangle = import("leaflet").Rectangle;
type LeafletCircleMarker = import("leaflet").CircleMarker;
type LeafletFeatureGroup = import("leaflet").FeatureGroup;

const DEFAULT_CENTER: [number, number] = [19.4326, -99.1332];
const DEFAULT_ZOOM = 10;

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

export function CampaignStoreSelectionMap({
    stores,
    selectedStoreIds,
    onSelectionChange,
    rectangleBounds,
    onRectangleBoundsChange,
}: CampaignStoreSelectionMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const leafletRef = useRef<LeafletModule | null>(null);
    const markerLayerRef = useRef<LeafletFeatureGroup | null>(null);
    const rectangleRef = useRef<LeafletRectangle | null>(null);
    const pendingMarkerRef = useRef<LeafletCircleMarker | null>(null);
    const firstCornerRef = useRef<[number, number] | null>(null);
    const isDrawingRef = useRef(false);
    const storesRef = useRef(stores);
    const selectedStoreIdsRef = useRef(selectedStoreIds);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onRectangleBoundsChangeRef = useRef(onRectangleBoundsChange);
    const [mapReady, setMapReady] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [firstCorner, setFirstCorner] = useState<[number, number] | null>(null);

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
        onRectangleBoundsChangeRef.current = onRectangleBoundsChange;
    }, [onRectangleBoundsChange]);

    useEffect(() => {
        isDrawingRef.current = isDrawing;
    }, [isDrawing]);

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
            markerLayer.addTo(map);
            markerLayerRef.current = markerLayer;

            const handleClick = (event: { latlng: { lat: number; lng: number } }) => {
                if (!isDrawingRef.current) {
                    return;
                }

                const nextPoint: [number, number] = [event.latlng.lat, event.latlng.lng];
                const currentFirstCorner = firstCornerRef.current;

                if (!currentFirstCorner) {
                    firstCornerRef.current = nextPoint;
                    setFirstCorner(nextPoint);
                    onRectangleBoundsChangeRef.current(null);
                    return;
                }

                const southWest: [number, number] = [
                    Math.min(currentFirstCorner[0], nextPoint[0]),
                    Math.min(currentFirstCorner[1], nextPoint[1]),
                ];
                const northEast: [number, number] = [
                    Math.max(currentFirstCorner[0], nextPoint[0]),
                    Math.max(currentFirstCorner[1], nextPoint[1]),
                ];
                const bounds: [[number, number], [number, number]] = [southWest, northEast];
                const insideIds = storesRef.current
                    .filter(
                        (store) =>
                            store.latitude >= southWest[0] &&
                            store.latitude <= northEast[0] &&
                            store.longitude >= southWest[1] &&
                            store.longitude <= northEast[1],
                    )
                    .map((store) => store.storeId);

                onSelectionChangeRef.current(
                    Array.from(new Set([...selectedStoreIdsRef.current, ...insideIds])),
                );
                onRectangleBoundsChangeRef.current(bounds);
                firstCornerRef.current = null;
                setFirstCorner(null);
                setIsDrawing(false);
            };

            map.on("click", handleClick);

            cleanup = () => {
                cancelAnimationFrame(frameId);
                cancelAnimationFrame(nestedFrameId);
                resizeObserver.disconnect();
                map.off("click", handleClick);
                pendingMarkerRef.current?.remove();
                rectangleRef.current?.remove();
                markerLayer.clearLayers();
                map.remove();
                pendingMarkerRef.current = null;
                rectangleRef.current = null;
                markerLayerRef.current = null;
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
        const map = mapRef.current;

        if (!L || !map || !mapReady) {
            return;
        }

        rectangleRef.current?.remove();
        rectangleRef.current = null;

        if (rectangleBounds) {
            rectangleRef.current = L.rectangle(rectangleBounds, {
                color: "#0f766e",
                weight: 2,
                fillColor: "#14b8a6",
                fillOpacity: 0.14,
                dashArray: "8 6",
            }).addTo(map);
        }
    }, [mapReady, rectangleBounds]);

    useEffect(() => {
        const L = leafletRef.current;
        const map = mapRef.current;

        if (!L || !map || !mapReady) {
            return;
        }

        pendingMarkerRef.current?.remove();
        pendingMarkerRef.current = null;

        if (firstCorner) {
            pendingMarkerRef.current = L.circleMarker(firstCorner, {
                radius: 8,
                color: "#0f766e",
                weight: 2,
                fillColor: "#2dd4bf",
                fillOpacity: 0.55,
            }).addTo(map);
        }
    }, [firstCorner, mapReady]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <p>
                    Navega el mapa libremente y activa el modo dibujo solo cuando quieras delimitar
                    una zona.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (isDrawing) {
                                firstCornerRef.current = null;
                                setFirstCorner(null);
                                setIsDrawing(false);
                                return;
                            }

                            firstCornerRef.current = null;
                            setFirstCorner(null);
                            setIsDrawing(true);
                        }}
                        className={`rounded-full px-3 py-1.5 font-semibold transition ${
                            isDrawing
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                    >
                        {isDrawing ? "Cancelar trazo" : "Dibujar área"}
                    </button>
                    <button
                        type="button"
                        onClick={() => mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM)}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        Centrar CDMX
                    </button>
                    {(firstCorner || rectangleBounds) && (
                        <button
                            type="button"
                            onClick={() => {
                                firstCornerRef.current = null;
                                setFirstCorner(null);
                                setIsDrawing(false);
                                onRectangleBoundsChange(null);
                            }}
                            className="rounded-full border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            Limpiar área
                        </button>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-950/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                {isDrawing
                    ? firstCorner
                        ? "Paso 2: haz clic en la esquina opuesta para cerrar el rectángulo."
                        : "Paso 1: haz clic en la primera esquina del área."
                    : "El mapa queda fijo al abrir. Usa el zoom y arrastre para posicionarte antes de dibujar."}
            </div>

            <div
                className={`h-[360px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 ${
                    isDrawing ? "cursor-crosshair" : ""
                }`}
            >
                <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            </div>
        </div>
    );
}
