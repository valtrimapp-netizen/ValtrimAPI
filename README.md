<!-- WATERMARK_AUTHOR: Hecho por Gerardo Esparza -->
# Valtrim API

Valtrim API es el backend del proyecto Valtrim, construido con Node.js + Express + PostgreSQL.
Este servicio expone endpoints de autenticacion, incluye health check y administra el esquema
de base de datos mediante migraciones SQL.

## Requisitos

- Node.js 22+
- npm
- PostgreSQL

## Configuracion

1. Copia .env.example a .env
2. Ajusta DATABASE_URL y variables JWT

## Comandos

```bash
npm run migrate
npm run dev
npm run test
npm run check
```

## Nota

La API esta pensada para usarse junto al frontend Valtrim Web.
