# System Architecture - Frigo Labs MVP

```mermaid
graph TD
    ClinicDashboard[Next.js App / Clinic Dashboard] -->|REST API| NestJSBackend[NestJS Backend]
    NestJSBackend --> PostgreSQL[(PostgreSQL Database)]
    NestJSBackend --> S3[AWS S3 Storage]
    PostgreSQL --> SendGrid[SendGrid Email]
    PostgreSQL --> Twilio[Twilio SMS]
```

## Description

- **Frontend**: Next.js application providing the Clinic and Admin dashboards.
- **Backend**: NestJS framework handling business logic, authentication, and integration.
- **Database**: PostgreSQL (via Supabase) for transactional data.
- **Storage**: AWS S3 for lab result PDFs and other attachments.
- **Email**: SendGrid for transactional email notifications.
- **SMS**: Twilio for text message notifications.
