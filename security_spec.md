# Security Specification — Oftalmomed Centro Diagnóstico São Mateus 1

## 1. Data Invariants
1. **Global Default Deny**: Any path not explicitly matched is denied for all reads and writes.
2. **Verified Authentication**: Every read and write operation requires an authenticated user with `request.auth != null && request.auth.token.email_verified == true`.
3. **Strict Ownership (`ownerId`)**: Every document in `exam_records`, `pricing_rules`, and `clinic_configs` must carry an `ownerId` strictly matching `request.auth.uid` on creation, and `ownerId` is immutable on update (`incoming().ownerId == existing().ownerId`).
4. **No Blanket List / PII Protection**: `allow list` and `allow get` on `exam_records` and `pricing_rules` explicitly enforce `existing().ownerId == request.auth.uid || isAdmin()`.
5. **Strict Schema & Key Whitelisting**: Every `create` and `update` calls `isValidExamRecord(incoming())`, `isValidPricingRule(incoming())`, or `isValidClinicConfig(incoming())`, enforcing `.keys().hasAll(...)` and `.keys().hasOnly(...)` along with exact string lengths, regex patterns, and numeric boundaries.
6. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable (`incoming().createdAt == existing().createdAt`) on update. `updatedAt` must always equal `request.time`.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write (`exam_records`)**:
   `{ "ownerId": "user_1", "seqNumber": 1, "pedidoEmed": "1020", "pacienteNome": "NEIDE RIBEIRO DA SILVA", "dataRealizado": "2026-10-08", "mesCompetencia": "2026-10", "convenio": "SÃO MIGUEL SAÚDE", "unidadeIndicadora": "SÃO MATEUS 1", "medicoOpto": "DR. LUCAS", "repasseValor": 35, "valorExame": 120, "exameTipo": "OCT", "observacoes": "" }` (auth = null) -> `PERMISSION_DENIED`
2. **Unverified Email Spoof Attack (`exam_records`)**:
   Same payload with `auth = { uid: "user_1", token: { email: "lucas.clemente@clinicaoftalmomed.com.br", email_verified: false } }` -> `PERMISSION_DENIED`
3. **Identity Spoofing on Create (`exam_records`)**:
   Authenticated as `user_1`, setting `ownerId: "user_2"` -> `PERMISSION_DENIED`
4. **Shadow Field Injection on Create (`exam_records`)**:
   Valid payload + `"isAdmin": true` -> Rejected by `.keys().hasOnly(...)` -> `PERMISSION_DENIED`
5. **Shadow Field Injection on Update (`exam_records`)**:
   Updating `exam_records/rec_1` with extra key `"hacked": "yes"` -> Rejected by `isValidExamRecord` and `affectedKeys().hasOnly(...)` -> `PERMISSION_DENIED`
6. **Owner Hijack on Update (`exam_records`)**:
   Updating `ownerId` from `"user_1"` to `"user_2"` -> Rejected by `incoming().ownerId == existing().ownerId` -> `PERMISSION_DENIED`
7. **Timestamp Forgery on Create (`exam_records`)**:
   Providing past or future `createdAt` instead of `request.time` -> `PERMISSION_DENIED`
8. **Immutable `createdAt` Tampering on Update (`exam_records`)**:
   Modifying `createdAt` during an update -> `PERMISSION_DENIED`
9. **Resource Exhaustion / Oversized String (`exam_records`)**:
   `pacienteNome` with 500 characters (exceeds `maxLength: 120`) -> `PERMISSION_DENIED`
10. **Invalid Regex Pattern on Date (`exam_records`)**:
    `dataRealizado: "08/10/2026"` instead of `"2026-10-08"` (`^\d{4}-\d{2}-\d{2}$`) -> `PERMISSION_DENIED`
11. **Cross-Tenant PII Read (`exam_records`)**:
    `user_2` attempting `get` or `list` on `user_1`'s exam records -> `PERMISSION_DENIED`
12. **Self-Privilege Escalation (`admins/user_1`)**:
    `user_1` attempting to create or update `/admins/user_1` -> `PERMISSION_DENIED`
