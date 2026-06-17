# Technical Specification - Frigo Labs MVP

## Frontend

- **Framework**: Next.js 15, React 19
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Components**: ShadCN UI
- **Deployment**: Vercel

## Backend

- **Framework**: NestJS
- **Language**: TypeScript
- **Auth**: JWT + Refresh Tokens
- **Validation**: Zod
- **ORM**: Prisma
- **API Base URL**: `/api/v1`

## Database

- **Engine**: PostgreSQL
- **Hosting**: Supabase

## File Storage

- **Provider**: AWS S3
- **Usage**: Lab Results PDFs, Attachments

## Email & SMS

- **Email**: SendGrid
- **SMS**: Twilio

## Security

- HTTPS, JWT, bcrypt hashing
- Role-Based Access Control (RBAC)
- Audit Logs

## Roles & Permissions

- **ADMIN**: Manage Clinics, Workflows, Results.
- **CLINIC_USER**: Manage Patients, View Workflows, Results.

## API Endpoints Summary

- **/auth**: login, logout, refresh, me
- **/clinics**: CRUD
- **/patients**: CRUD
- **/workflows**: CRUD, status patch
- **/results**: upload, view by workflow, download
- **/notifications**: email, sms
