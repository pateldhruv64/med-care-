# Role Access Matrix (Go-Live Baseline)

This matrix defines the minimum expected access controls for production verification.

| Route Group              | Endpoint Pattern                          | Patient                        | Doctor                         | Admin     | Receptionist | Pharmacist         |
| ------------------------ | ----------------------------------------- | ------------------------------ | ------------------------------ | --------- | ------------ | ------------------ |
| Auth                     | `/api/users/login`, `/api/users/register` | ✅                             | ✅                             | ✅        | ✅           | ✅                 |
| Profile                  | `/api/users/profile`                      | ✅ (self)                      | ✅ (self)                      | ✅ (self) | ✅ (self)    | ✅ (self)          |
| Patients                 | `/api/patients`                           | ❌                             | ✅                             | ✅        | ✅           | ✅                 |
| Appointments             | `/api/appointments`                       | ✅ (self)                      | ✅ (own)                       | ✅        | ✅           | ❌                 |
| Prescriptions            | `/api/prescriptions`                      | ✅ (self read)                 | ✅ (create/read own)           | ✅ (read) | ❌           | ✅ (read/dispense) |
| Lab Reports              | `/api/lab-reports`                        | ✅ (self read)                 | ✅ (create/update own)         | ✅        | ❌           | ❌                 |
| Billing / Invoices       | `/api/invoices`                           | ✅ (self read)                 | ✅ (own read)                  | ✅        | ✅           | ✅                 |
| Beds                     | `/api/beds`                               | ❌                             | ✅                             | ✅        | ✅           | ❌                 |
| Medical History          | `/api/medical-history`                    | ✅ (self read)                 | ✅ (create/update own records) | ✅        | ❌           | ❌                 |
| Medicines                | `/api/medicines`                          | ❌                             | ❌                             | ✅        | ❌           | ✅                 |
| Notifications            | `/api/notifications`                      | ✅ (self)                      | ✅                             | ✅        | ✅           | ✅                 |
| QR Share Link Generation | `/api/qr-share/patients/:id/link`         | ❌                             | ✅                             | ✅        | ✅           | ✅                 |
| QR Details Resolution    | `/api/qr-share/patients/:id/details`      | Token-based public access only |

## Verification guidance

1. Test each protected route with all 5 roles.
2. Verify **deny** paths return 403 (or 401 when unauthenticated).
3. Verify self-scope routes do not expose another patient's or doctor's records.
4. Log all failures before go-live sign-off.
