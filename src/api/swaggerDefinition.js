/**
 * Static Swagger/OpenAPI definition for TrafegoDNS API
 * 
 * This is a manually maintained OpenAPI specification rather than using
 * automatic JSDoc parsing, which can be error-prone in some environments.
 */

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'TrafegoDNS API',
    version: '1.0.0',
    description: 'API for managing DNS records via TrafegoDNS',
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    },
    contact: {
      name: 'API Support',
      url: 'https://github.com/elmerfds/TrafegoDNS'
    }
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      DNSRecord: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'] },
          name: { type: 'string' },
          content: { type: 'string' },
          ttl: { type: 'number' },
          proxied: { type: 'boolean' },
          managed: { type: 'boolean' },
          priority: { type: 'number' }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'] }
        }
      }
    }
  },
  paths: {
    '/status': {
      get: {
        summary: 'Get system status',
        tags: ['Status'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'System status information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: { type: 'object' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/status/health': {
      get: {
        summary: 'Get API health',
        tags: ['Status'],
        responses: {
          200: {
            description: 'API health status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    message: { type: 'string', example: 'API is operational' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/dns/records': {
      get: {
        summary: 'Get all DNS records',
        tags: ['DNS'],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            schema: { type: 'integer', default: 1 }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Records per page',
            schema: { type: 'integer', default: 20 }
          },
          {
            name: 'type',
            in: 'query',
            description: 'Filter by record type',
            schema: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'] }
          }
        ],
        responses: {
          200: {
            description: 'List of DNS records',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: { 
                      type: 'array',
                      items: { $ref: '#/components/schemas/DNSRecord' }
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'number' },
                        limit: { type: 'number' },
                        total: { type: 'number' },
                        pages: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' }
        }
      },
      post: {
        summary: 'Create a new DNS record',
        tags: ['DNS'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'name', 'content'],
                properties: {
                  type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'] },
                  name: { type: 'string' },
                  content: { type: 'string' },
                  ttl: { type: 'number' },
                  proxied: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'DNS record created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: { $ref: '#/components/schemas/DNSRecord' }
                  }
                }
              }
            }
          },
          400: { description: 'Invalid input' },
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate user & get token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'password' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: { 
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        accessToken: { type: 'string' },
                        expiresIn: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Invalid credentials' }
        }
      }
    }
  }
};

module.exports = swaggerDefinition;