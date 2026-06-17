# Frigo Labs MVP - Product Requirements Document

## Overview

Frigo Labs is a white-label diagnostic workflow platform that helps clinics manage patients through the diagnostic testing process.
The goal is to reduce patient drop-off between consultation and treatment.
Frigo Labs acts as the operational layer between clinics, testing providers, labs, and patients.

## Problem Statement

Clinics lose potential revenue when patients fail to complete testing after consultation.
Current workflow is fragmented:

- Manual tracking
- Email chains
- Spreadsheet management
- Missing patient follow-up
- Delayed lab result delivery

## Goal

Enable clinics to track every patient from:
Consultation → Test Ordered → Kit Shipped → Sample Collected → Lab Results Received → Treatment Ready

## User Types

### Frigo Labs Admin

Responsibilities:

- Manage clinics
- Manage workflows
- Upload lab results
- Update workflow statuses
- Send notifications

### Clinic User

Responsibilities:

- Add patients
- Track workflow progress
- Receive results
- Monitor testing completion

## MVP Features

### Authentication

- Login, Logout, Password Reset

### Clinic Dashboard

- View patients, workflow status, and results.

### Admin Dashboard

- View all clinics and workflows.
- Manage patient lifecycle.

### Patient Management

- Add, Edit, Search patients.

### Workflow Tracking

Statuses:

1. Patient Added
2. Test Ordered
3. Kit Shipped
4. Sample Collected
5. Lab Received
6. Lab Processing
7. Results Available
8. Completed

### Lab Results

- Upload/Download PDF
- View History

### Notifications

- Email, SMS

## Success Metrics

- First clinic onboarded
- First patient completed workflow
- < 5% workflow abandonment
- < 2 mins patient enrollment time
