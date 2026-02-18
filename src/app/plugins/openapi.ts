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
        name: 'Alerts',
        description: 'Operational alerts and mocked notifications.',
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
        name: 'CPGs',
        description: 'Consumer packaged goods parent entities.',
      },
      {
        name: 'Brands',
        description: 'Brand catalog linked to CPGs.',
      },
      {
        name: 'Products',
        description: 'Product catalog linked to brands.',
      },
      {
        name: 'Cards',
        description: 'Consumer card issuance endpoints.',
      },
      {
        name: 'Campaigns',
        description: 'Campaign lifecycle and audit endpoints.',
      },
      {
        name: 'Transactions',
        description: 'Transaction registration and retrieval endpoints.',
      },
      {
        name: 'Rewards',
        description: 'Rewards catalog and redemption endpoints.',
      },
      {
        name: 'Reports',
        description: 'Operational and analytics summary endpoints.',
      },
      {
        name: 'WhatsApp',
        description: 'Inbound WhatsApp webhooks and operational metrics.',
      },
      {
        name: 'Jobs',
        description: 'Manual and scheduled operational jobs.',
      },
    ],
  },
});
