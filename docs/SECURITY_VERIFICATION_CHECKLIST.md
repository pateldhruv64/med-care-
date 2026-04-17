# Security Verification Checklist (P0/P1)

Use this checklist before go-live with real patient data.

## 1) Authentication abuse protection

- [ ] 6+ failed login attempts from same source are throttled.
- [ ] Registration burst is throttled.
- [ ] Invalid credentials always return generic authentication failure.

## 2) Authorization and least privilege

- [ ] Role matrix in `docs/ROLE_ACCESS_MATRIX.md` validated for all route groups.
- [ ] Doctor cannot update another doctor's medical history record.
- [ ] Doctor cannot update another doctor's lab report.
- [ ] Doctor cannot create prescription for appointment not assigned to them.

## 3) Data integrity and transaction safety

- [ ] Pharmacy invoice creation rolls back when stock is insufficient.
- [ ] Bed discharge rolls back if invoice write fails.
- [ ] Appointment/patient mismatch is blocked in invoice creation.

## 4) QR sharing and token safety

- [ ] Generated QR links use hash token format (`#token=`), not query token.
- [ ] QR token is sent in request body during resolution.
- [ ] Token is one-time use and expires according to configured TTL.
- [ ] Invalid QR resolution does not reveal patient existence details.

## 5) Realtime privacy

- [ ] Socket clients cannot join arbitrary rooms from frontend.
- [ ] Medicine realtime updates are visible only to Admin/Pharmacist.
- [ ] Patients do not receive unrelated staff-only events.

## 6) Operational readiness

- [ ] `/health` endpoint returns 200 when DB connected.
- [ ] Missing critical env values block startup.
- [ ] Request logs redact sensitive query params (e.g., token values).
- [ ] Request body size limit is enforced.

## 7) Build and release gate

- [ ] Backend smoke imports pass.
- [ ] Frontend production build passes.
- [ ] CI workflow passes on PR branch.

---

Sign-off owner: DHRUV PATEL

Date:17-04-2026
