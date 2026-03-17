"use client";

import { useEffect, useRef } from "react";

type MapStore = {
    storeId: string;
    storeName: string;
    storeCode: string;
    city?: string;
    state?: string;
    latitude: number;
    longitude: number;
};

type StoresMapProps = {
    stores: MapStore[];
    selectedStoreId?: string;
    onSelectStore: (storeId: string) => void;
};

const DEFAULT_CENTER: [number, number] = [19.4326, -99.1332];

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

export function StoresMap({ stores, selectedStoreId, onSelectStore }: StoresMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};

        void import("leaflet").then((leaflet) => {
            if (cancelled || !containerRef.current) {
                return;
            }

            const L = leaflet.default ?? leaflet;
            const map = L.map(containerRef.current, {
                zoomControl: false,
                scrollWheelZoom: true,
            });

            L.control.zoom({ position: "bottomright" }).addTo(map);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            if (stores.length === 0) {
                map.setView(DEFAULT_CENTER, 9);
            } else {
                const bounds = L.latLngBounds(
                    stores.map((store) => [store.latitude, store.longitude] as [number, number]),
                );
                map.fitBounds(bounds, { padding: [28, 28] });
            }

            const markers = stores.map((store, index) => {
                const isSelected = store.storeId === selectedStoreId;
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
                [store.city, store.state].filter(Boolean).join(", ") || "Sin ubicación textual",
            )}</p>
          </div>`,
                );
                marker.on("click", () => onSelectStore(store.storeId));
                marker.addTo(map);

                if (isSelected) {
                    marker.openPopup();
                }

                return marker;
            });

            const selectedStore = stores.find((store) => store.storeId === selectedStoreId);
            if (selectedStore) {
                map.setView(
                    [selectedStore.latitude, selectedStore.longitude],
                    Math.max(map.getZoom(), 12),
                    {
                        animate: false,
                    },
                );
            }

            cleanup = () => {
                for (const marker of markers) {
                    marker.remove();
                }
                map.remove();
            };
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [stores, selectedStoreId, onSelectStore]);

    return <div ref={containerRef} className="h-[420px] w-full rounded-[28px]" />;
}
