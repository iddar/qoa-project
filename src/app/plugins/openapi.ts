import { openapi } from "@elysiajs/openapi";

export const openApiPlugin = openapi({
  documentation: {
    info: {
      title: "QOA API",
      version: "1.0.0",
      description: "Internal API surface for QOA services.",
    },
    tags: [
      {
        name: "Health",
        description: "Service availability and readiness endpoints.",
      },
    ],
  },
});
