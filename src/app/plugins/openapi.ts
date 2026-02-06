import { openapi } from '@elysiajs/openapi';

export const openApiPlugin = openapi({
  documentation: {
    info: {
      title: 'QOA API',
      version: '1.0.0',
      description: 'Internal API surface for QOA services.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Service availability and readiness endpoints.',
      },
      {
        name: 'Auth',
        description: 'Authentication and token issuance endpoints.',
      },
      {
        name: 'Users',
        description: 'User profile and account endpoints.',
      },
      {
        name: 'Stores',
        description: 'Store catalog and registration endpoints.',
      },
      {
        name: 'Cards',
        description: 'Consumer card issuance endpoints.',
      },
    ],
  },
});
