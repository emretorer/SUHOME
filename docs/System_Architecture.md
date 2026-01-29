# System Architecture

This document describes the system components and data flow. It does not repeat API details or environment setup.

## Components
- **Client (React + Vite)**  
  Single-page app for store browsing, cart, checkout, profile, and support chat.

- **Server (Node.js + Express)**  
  REST API under `/api` and static hosting for the built client.  
  Includes email delivery (SMTP) and PDF invoice generation.

- **Database (MySQL)**  
  Primary data store for users, products, orders, payments, comments, and support.

## Data flow (overview)
1. Client makes HTTP requests to `/api/*` endpoints.
2. Server validates input and performs DB operations via `mysql2`.
3. For emails, server uses SMTP settings from environment variables.
4. For invoices, server generates PDF and sends it via email.
5. Server serves the client build for all non-API routes.

## Deployment model
- Single container image with:
  - Prebuilt client assets in `server/public`
  - Server runtime in `server/src`
- Environment variables injected at runtime (Cloud Run or Docker)

## Database management (production)
- Migrations are run by a privileged user (`suhome_migrate`).
- Application runtime uses a restricted user (`suhome_app`) with DML only.
- No schema mutations occur during server startup.

## External integrations
- SMTP (Gmail or other providers)
