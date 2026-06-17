# Database Schema - Frigo Labs MVP

## Tables

### Users

- `id` UUID PK
- `clinic_id` UUID FK
- `name` VARCHAR(255)
- `email` VARCHAR(255)
- `password_hash` TEXT
- `role` ENUM (ADMIN, CLINIC_USER)
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### Clinics

- `id` UUID PK
- `name` VARCHAR(255)
- `contact_name` VARCHAR(255)
- `email` VARCHAR(255)
- `phone` VARCHAR(50)
- `status` VARCHAR(50)
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### Patients

- `id` UUID PK
- `clinic_id` UUID FK
- `first_name` VARCHAR(255)
- `last_name` VARCHAR(255)
- `email` VARCHAR(255)
- `phone` VARCHAR(50)
- `dob` DATE
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### Workflows

- `id` UUID PK
- `patient_id` UUID FK
- `clinic_id` UUID FK
- `test_type` VARCHAR(255)
- `status` ENUM (PATIENT_ADDED, TEST_ORDERED, KIT_SHIPPED, SAMPLE_COLLECTED, LAB_RECEIVED, LAB_PROCESSING, RESULTS_AVAILABLE, COMPLETED)
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

### Workflow_History

- `id` UUID PK
- `workflow_id` UUID FK
- `status` VARCHAR(255)
- `notes` TEXT
- `updated_by` UUID
- `created_at` TIMESTAMP

### Lab_Results

- `id` UUID PK
- `workflow_id` UUID FK
- `patient_id` UUID FK
- `file_url` TEXT
- `uploaded_by` UUID
- `uploaded_at` TIMESTAMP

### Notifications

- `id` UUID PK
- `workflow_id` UUID FK
- `channel` ENUM (EMAIL, SMS)
- `recipient` VARCHAR(255)
- `message` TEXT
- `status` VARCHAR(50)
- `sent_at` TIMESTAMP

## Relationships

- **Clinic** has many **Users**, **Patients**, and **Workflows**.
- **Patient** has many **Workflows**.
- **Workflow** has one **Patient**, one **Clinic**, many **History** records, many **Lab Results**, and many **Notifications**.
