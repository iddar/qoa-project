export const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export const formatDateTime = (value: string) => new Date(value).toLocaleString("es-MX");

export const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
