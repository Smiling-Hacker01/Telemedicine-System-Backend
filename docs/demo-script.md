# Amrutam Telemedicine Backend — 5-Minute Demonstration Script

**Video Target Duration:** Exactly 5 Minutes (00:00 – 05:00)  
**Presenter:** Backend Engineering Lead  
**Deliverable Requirement:** Assignment Evaluation Rubric Demonstration

---

## Video Outline & Time Breakdown

```text
┌────────────────────────┬────────────────────────────────────────────────────────┐
│ Timestamp              │ Segment Title                                          │
├────────────────────────┼────────────────────────────────────────────────────────┤
│ 00:00 – 00:45 (45s)    │ 1. Architecture Blueprint & Production Standards       │
│ 00:45 – 01:30 (45s)    │ 2. User Lifecycle, TOTP MFA & Account Lockout          │
│ 01:30 – 02:30 (60s)    │ 3. Atomic Slot Reservation & Concurrency Race Test     │
│ 02:30 – 03:30 (60s)    │ 4. Consultation Lifecycle & Encrypted Prescriptions    │
│ 03:30 – 04:15 (45s)    │ 5. HMAC Payment Webhook & Admin Analytics Dashboard   │
│ 04:15 – 05:00 (45s)    │ 6. Observability, Test Coverage & Benchmark SLA Report │
└────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Script

### Segment 1: Architecture Blueprint & Production Standards (00:00 – 00:45)
- **Visual**: Show `README.md` and the architecture diagram in `docs/architecture.md`.
- **Narration**:
  > *"Hello, welcome to the demonstration of Amrutam's Telemedicine Backend. Built with Node.js 22, strict TypeScript, Fastify v5, PostgreSQL 16, and Redis 7, this platform is engineered for 100,000 daily consultations. It adheres to strict separation of concerns across 9 domain modules, zero double-booking via pessimistic database row locks, AES-256-GCM encrypted medical records, and automated CI/CD quality gates."*
- **Action**: Highlight the Swagger interactive documentation at `http://localhost:3000/docs`.

---

### Segment 2: User Lifecycle, TOTP MFA & Account Lockout (00:45 – 01:30)
- **Visual**: Postman / Terminal hitting `/api/v1/auth/register` and `/api/v1/auth/mfa/setup`.
- **Narration**:
  > *"First, we demonstrate identity and security. Passwords are encrypted with bcrypt (12 salt rounds). When registering a patient or doctor, the system issues short-lived JWT access tokens and secure refresh tokens. We support RFC 6238 TOTP Multi-Factor Authentication: users receive a base32 secret, QR code URI, and single-use recovery backup codes. Furthermore, after 5 consecutive failed login attempts, the account is automatically locked out for 15 minutes to defeat credential-stuffing attacks."*
- **Action**: Trigger 5 failed login attempts to show the immediate `403 Forbidden: Account is temporarily locked` response.

---

### Segment 3: Atomic Slot Reservation & Concurrency Race Demonstration (01:30 – 02:30)
- **Visual**: Split screen showing doctor availability creation and running `tests/integration/concurrency-booking.test.ts`.
- **Narration**:
  > *"Next is the core booking engine. Doctors configure non-overlapping availability slots. To prove our zero double-booking invariant under extreme concurrent spikes, our automated test fires 10 simultaneous requests from 10 different patients attempting to reserve the exact same slot at the exact same millisecond. Using PostgreSQL `SELECT ... FOR UPDATE` row-level locking within an isolated RepeatableRead transaction, exactly one booking succeeds and transitions the slot to BOOKED, while the other nine transactions receive a 409 Conflict. Furthermore, our Idempotency middleware caches write responses for 24 hours, guaranteeing that network retries never cause duplicate bookings or charges."*
- **Action**: Run `npx vitest run tests/integration/concurrency-booking.test.ts` to show the test passing in real time.

---

### Segment 4: Consultation Lifecycle & Encrypted Prescriptions (02:30 – 03:30)
- **Visual**: Show `POST /api/v1/prescriptions` and the raw PostgreSQL database table view.
- **Narration**:
  > *"Consultations progress through a formal state machine: PENDING_PAYMENT, SCHEDULED, IN_PROGRESS, and COMPLETED. Once a consultation is active, only the assigned doctor has the privilege to issue a medical prescription. To protect sensitive patient health information (PHI) under DISHA and HIPAA guidelines, the diagnosis and medications list are encrypted at rest using AES-256-GCM. We also compute an HMAC-SHA256 digital signature from the doctor's credentials to guarantee non-repudiation. Notice in the database that no plaintext medical data is stored, and unauthorized patients attempting to inspect another patient's prescription are denied with 403 Forbidden."*
- **Action**: Query database showing encrypted payload `iv:authTag:ciphertext` in `prescriptions.diagnosis`.

---

### Segment 5: HMAC Payment Webhook & Admin Analytics Dashboard (03:30 – 04:15)
- **Visual**: Postman sending mock webhook to `/api/v1/payments/webhook`, then querying `/api/v1/admin/analytics`.
- **Narration**:
  > *"Our payment integration simulates production payment gateways like Razorpay or Stripe. Every webhook delivery verifies a cryptographic HMAC-SHA256 signature in the headers. Upon verified receipt of payment.succeeded, the payment transitions to SUCCESS and the consultation atomically moves to SCHEDULED. Duplicate webhook deliveries are handled idempotently. Finally, the Admin Analytics dashboard aggregates real-time platform KPIs: total consultations, completion rates, gross revenue, and paginated audit logs with zero sensitive data leakage."*
- **Action**: Show `/api/v1/admin/analytics` JSON response with aggregated revenue and completion rates.

---

### Segment 6: Observability, Test Coverage & Benchmark SLA Report (04:15 – 05:00)
- **Visual**: Show `/metrics`, `/healthz`, `/readyz`, and run `npm run benchmark`.
- **Narration**:
  > *"Production readiness is proven through observability and performance. The system exposes Kubernetes-native liveness `/healthz`, readiness `/readyz`, and Prometheus `/metrics` tracking request duration histograms and booking counters. Our test suite includes 45 unit, integration, concurrency, security, and contract tests with over 75% code coverage. Finally, our benchmark tool tests real traffic against PostgreSQL and Redis: achieving a read p95 of under 160 ms (well within the 200 ms SLA) and a write p95 of under 1 ms (well within the 500 ms SLA), proving our platform is ready for 100,000 daily consultations. Thank you."*
- **Action**: Show the clean benchmark terminal summary table and green test results.
