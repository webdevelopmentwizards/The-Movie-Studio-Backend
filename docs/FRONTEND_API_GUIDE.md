# The Movie Studio — Frontend API Guide

Yeh document backend ki **saari public APIs** ka frontend integration guide hai: har endpoint ka purpose, request, response, auth, aur typical UI flow.

Base path: **`/api/v1`**

Example:

```
https://<HOST>/api/v1
```

Local default: `http://localhost:<PORT>/api/v1` (`PORT` env se aata hai).

---

## 1. Health check

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1` | Public | Server alive check |

**Response:** plain text

```
The Movie Studio Backend Running
```

JSON nahi hai. Unknown routes `404` deti hain (neeche error format dekho).

---

## 2. Global rules (frontend ke liye zaroori)

### CORS

- `origin: true` — request origin allow hoti hai
- `credentials: true`
- Allowed methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`
- Allowed headers: `Content-Type`, `Authorization`, `X-Requested-With`, `X-Timezone`, `Accept`, `Origin`, …

Frontend **`Authorization: Bearer <accessToken>`** header bhej sakta hai.

### Content-Type

| Use case | Content-Type |
|----------|----------------|
| JSON body | `application/json` |
| File / audition upload | `multipart/form-data` (field names neeche) |

Body size limit (urlencoded): **100MB**.

### Standard JSON envelope

Success **hamesha** is shape mein aata hai:

```json
{
  "statusCode": "10000",
  "message": "Login successful",
  "data": {}
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `statusCode` | string | `"10000"` = success, `"10001"` = failure, `"10003"` = invalid access token |
| `message` | string | User-facing / log message |
| `data` | object \| null | Payload (kabhi-kabhi missing) |

HTTP status alag hai (`200`, `400`, `401`, `403`, `404`, `409`, `500`). Frontend **HTTP status + `statusCode` + `message`** dono check kare.

### Auth header

Protected APIs:

```http
Authorization: Bearer <accessToken>
```

Missing / invalid format → **401** `"Invalid Authorization"`.

Expired token → **401** with:

```json
{
  "statusCode": "10003",
  "message": "Token is expired",
  "instruction": "refresh_token"
}
```

Header `instruction: refresh_token` bhi set hota hai.

> **Important:** Backend currently **refresh-token endpoint expose nahi karti**. Token expire hone par user ko **dobara login / OAuth** karwana hoga. `refreshToken` login response mein milta hai, lekin use karne ka public API nahi hai.

### Membership gate

Kuch APIs ke liye **active membership** zaroori hai (`requireMembership`):

- `POST /file/upload`
- `POST /file/delete`
- `PUT /file/update`
- `POST /chat`

Agar user logged-in hai lekin member nahi:

- HTTP **403**
- `message`: `"Membership required. Please choose a plan to continue."`

**SUPER_ADMIN** role wale users ko membership skip milti hai (`isMember: true`, `requiresPlan: false`).

Login / signup / `/auth/me` / `/membership/me` responses mein ye flags aate hain:

| Field | Meaning |
|-------|---------|
| `isMember` | Active plan hai (ya SUPER_ADMIN) |
| `requiresPlan` | `true` ho to paywall dikhao — chat/upload band |
| `membership` | Active membership object, warna `null` |

---

## 3. Shared objects

### User (password kabhi nahi aata)

```json
{
  "id": "uuid",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+1...",
  "profileImage": "https://...",
  "isEmailVerified": false,
  "emailVerifiedAt": null,
  "roleId": "uuid",
  "provider": "EMAIL",
  "oauthUid": null,
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-08-24T12:00:00.000Z",
  "updatedAt": "2026-08-24T12:00:00.000Z",
  "role": {
    "id": "uuid",
    "code": "USER"
  }
}
```

| `provider` | Values |
|------------|--------|
| Auth source | `EMAIL` \| `GOOGLE` \| `FACEBOOK` \| `APPLE` |

| `role.code` | Values |
|-------------|--------|
| Role | `USER` \| `SUPER_ADMIN` |

### Tokens

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>"
}
```

`accessToken` ko **har protected request** par Bearer ke tor pe bhejo. Local storage / secure storage mein save karo.

### Membership

```json
{
  "id": "uuid",
  "userId": "uuid",
  "planId": "monthly",
  "status": "ACTIVE",
  "startsAt": "2026-08-24T12:00:00.000Z",
  "endsAt": "2026-09-24T12:00:00.000Z",
  "transactionId": "123456",
  "subscriptionId": null,
  "createdAt": "2026-08-24T12:00:00.000Z",
  "updatedAt": "2026-08-24T12:00:00.000Z"
}
```

| Field | Values |
|-------|--------|
| `planId` | `monthly` \| `yearly` |
| `status` | `ACTIVE` \| `CANCELLED` \| `EXPIRED` \| `PENDING` |

Active membership: `status === "ACTIVE"` **aur** (`endsAt` null **ya** `endsAt` future).

---

## 4. API index

| # | Method | Path | Auth | Membership | Purpose |
|---|--------|------|------|------------|---------|
| 1 | `GET` | `/api/v1` | Public | — | Health |
| 2 | `POST` | `/api/v1/auth/signup` | Public | — | Register (email) |
| 3 | `POST` | `/api/v1/auth/register` | Public | — | Same as signup |
| 4 | `POST` | `/api/v1/auth/login` | Public | — | Email login |
| 5 | `POST` | `/api/v1/auth/logout` | Bearer | — | Session destroy |
| 6 | `GET` | `/api/v1/auth/me` | Bearer | — | Current user + plan flags |
| 7 | `GET` | `/api/v1/auth/google` | Public (redirect) | — | Start Google OAuth |
| 8 | `GET` | `/api/v1/auth/google/callback` | Public (Google) | — | Google OAuth return |
| 9 | `GET` | `/api/v1/auth/facebook` | Public (redirect) | — | Start Facebook OAuth |
| 10 | `GET` | `/api/v1/auth/facebook/callback` | Public (Facebook) | — | Facebook OAuth return |
| 11 | `GET` | `/api/v1/membership/config` | Public | — | Accept.js keys + plan prices |
| 12 | `GET` | `/api/v1/membership/me` | Bearer | — | Latest membership |
| 13 | `POST` | `/api/v1/membership/pay` | Bearer | — | Charge card + activate plan |
| 14 | `POST` | `/api/v1/file/upload` | Bearer | Required | Upload file to storage |
| 15 | `POST` | `/api/v1/file/delete` | Bearer | Required | Delete file |
| 16 | `PUT` | `/api/v1/file/update` | Bearer | Required | Replace file |
| 17 | `POST` | `/api/v1/chat` | Bearer | Required | AI assistant |
| 18 | `POST` | `/api/v1/contact` | Public | — | Contact form |
| 19 | `POST` | `/api/v1/audition/submit` | Optional Bearer | — | Audition video + photo |

---

## 5. Auth APIs — `/api/v1/auth`

Naya user **email/password** se account bana sakta hai, login kar sakta hai, Google/Facebook se aa sakta hai. Signup ke baad user **member nahi** hota — `requiresPlan: true` aayega. Paywall (`/membership/pay`) ke baad hi chat/upload khulte hain.

### 5.1 Sign up / Register

**Same handler.** Dono paths use kar sakte ho; frontend ek hi use kare (recommend: `/signup`).

```
POST /api/v1/auth/signup
POST /api/v1/auth/register
```

**Auth:** public

**Body (JSON):**

| Field | Required | Rules |
|-------|----------|--------|
| `email` | Yes | Valid email, 3–50 chars |
| `password` | Yes | 6–500 chars |
| `firstName` | Yes | string |
| `lastName` | No | string, `""`, or `null` |
| `contactNumber` | No | phone (backend `phoneNumber` pe map karta hai) |
| `phoneNumber` | No | same as contact; `contactNumber` pehle prefer |

```json
{
  "email": "jane@example.com",
  "password": "secret12",
  "firstName": "Jane",
  "lastName": "Doe",
  "contactNumber": "+15551234567"
}
```

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Registration successful",
  "data": {
    "user": { "...": "User object, no password" },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    },
    "isMember": false,
    "requiresPlan": true,
    "membership": null
  }
}
```

**Frontend:** tokens save karo, user ko **membership/paywall** pe le jao (`requiresPlan === true`).

**Errors:**

| HTTP | When |
|------|------|
| `400` | Validation fail, e.g. `"email must be a valid email"` |
| `400` | `"User already registered"` |

---

### 5.2 Login

```
POST /api/v1/auth/login
```

**Auth:** public

**Body:**

```json
{
  "email": "jane@example.com",
  "password": "secret12"
}
```

| Field | Required | Rules |
|-------|----------|--------|
| `email` | Yes | valid email, 3–50 |
| `password` | Yes | min 6 |

OAuth se bane users (`provider` Google/Facebook) **sirf tab** password login kar sakte hain jab unka password set ho.

**Success `200`:** `"Login successful"` — same `data` shape as signup (`user`, `tokens`, `isMember`, `requiresPlan`, `membership`).

**Errors:**

| HTTP | Message |
|------|---------|
| `400` | `"Invalid credentials"` (email nahi mila — same message security ke liye) |
| `400` | `"Your account has been deactivated"` |
| `400` | `"Your account has been deleted"` |
| `400` | `"Credentials not set"` (EMAIL user, password missing) |
| `400` | Validation errors |

---

### 5.3 Logout

```
POST /api/v1/auth/logout
```

**Auth:** Bearer required

**Body:** none

Server us user ka keystore delete karti hai — purana access token **invalid** ho jata hai.

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Logout successful"
}
```

(`data` nahi hota.)

**Frontend:** local tokens + user state clear karo.

---

### 5.4 Current user (session restore)

```
GET /api/v1/auth/me
```

**Auth:** Bearer required

App boot / page refresh par call karo: user + membership flags refresh ho jate hain.

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Authenticated user",
  "data": {
    "user": { "...": "User object" },
    "isMember": true,
    "requiresPlan": false,
    "membership": { "...": "Membership or null" }
  }
}
```

Tokens yahan **nahi** aate.

**Errors:** `401` invalid/expired token, `400` `"User not found"`.

---

### 5.5 Google OAuth

Browser ko Google pe redirect karta hai, phir backend callback pe tokens deta hai.

#### Start

```
GET /api/v1/auth/google
```

**Query (optional, mobile / custom return):**

| Param | Purpose |
|-------|---------|
| `redirect_uri` | Success ke baad yahan redirect (allowlisted) |
| `error_redirect_uri` | Error ke baad yahan |

Allowlisted examples:

- `https://...` (web)
- `themoviestudio://auth/success`
- `movie-studio://auth/success`
- `exp://<host>/--/auth/success`

Invalid URI → `400` `"Invalid redirect_uri..."`

**Response:** HTTP **302** Google consent screen pe.

**Web frontend:**

```js
window.location.href = `${API_BASE}/auth/google`;
```

**Mobile:**

```
GET /api/v1/auth/google?redirect_uri=themoviestudio://auth/success&error_redirect_uri=themoviestudio://auth/error
```

#### Callback (Google isko hit karta hai, frontend directly nahi)

```
GET /api/v1/auth/google/callback?code=...&state=...
```

**Web (bina `redirect_uri`):** JSON success — same login payload:

```json
{
  "statusCode": "10000",
  "message": "Login successful",
  "data": {
    "user": {},
    "tokens": { "accessToken": "...", "refreshToken": "..." },
    "isMember": false,
    "requiresPlan": true,
    "membership": null
  }
}
```

Google ke `GOOGLE_REDIRECT_URI` ko backend env pe set hona chahiye. Web app ke liye usually backend JSON return karega **tab** jab `redirect_uri` na diya ho. Agar web ko frontend URL pe wapas lana ho to allowlisted `https://your-frontend/auth/callback` `redirect_uri` mein do.

**Mobile success redirect query:**

```
themoviestudio://auth/success?accessToken=...&refreshToken=...&user=<url-encoded JSON>
```

`user` JSON ke andar user fields + `isMember` + `requiresPlan` hote hain (full `membership` object query string mein nahi).

**Mobile error:**

```
themoviestudio://auth/error?error=...&message=...
```

---

### 5.6 Facebook OAuth

Google jaisa hi flow.

```
GET /api/v1/auth/facebook
GET /api/v1/auth/facebook/callback
```

Wahi `redirect_uri` / `error_redirect_uri` rules, wahi success JSON / deep-link shape.

---

## 6. Membership APIs — `/api/v1/membership`

Plans: **monthly** aur **yearly**. Amounts env se aate hain (`MEMBERSHIP_MONTHLY_AMOUNT`, `MEMBERSHIP_YEARLY_AMOUNT`) — **hardcode mat karo**, `/config` se lo.

Payment: **Authorize.Net Accept.js**. Card number **kabhi backend ko mat bhejo**. Frontend card tokenize karta hai → `opaqueData` backend ko jata hai.

### 6.1 Payment config (public)

```
GET /api/v1/membership/config
```

Paywall / checkout page load par call karo. Accept.js script URL + public keys yahan se milte hain.

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Payment config",
  "data": {
    "env": "sandbox",
    "apiLoginId": "...",
    "clientKey": "...",
    "acceptJsUrl": "https://jstest.authorize.net/v1/Accept.js",
    "plans": {
      "monthly": { "id": "monthly", "label": "Monthly", "amount": 9.99 },
      "yearly": { "id": "yearly", "label": "Yearly", "amount": 89.99 }
    }
  }
}
```

| `env` | Script |
|-------|--------|
| `production` | `https://js.authorize.net/v1/Accept.js` |
| anything else | `https://jstest.authorize.net/v1/Accept.js` |

**Checkout steps:**

1. `GET /membership/config`
2. `acceptJsUrl` script load karo
3. User card enter kare
4. Accept.js se `opaqueData = { dataDescriptor, dataValue }` lo
5. Logged-in user `POST /membership/pay` with `planId` + `opaqueData`

---

### 6.2 My membership

```
GET /api/v1/membership/me
```

**Auth:** Bearer required

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Membership retrieved",
  "data": {
    "membership": { "...": "latest row or null" },
    "isMember": false,
    "requiresPlan": true
  }
}
```

`membership` **latest** record hai (expired bhi ho sakta hai). UI ke liye **`isMember`** use karo, sirf object presence nahi.

---

### 6.3 Pay / activate plan

```
POST /api/v1/membership/pay
```

**Auth:** Bearer required (membership **is se pehle** zaroori nahi)

**Body:**

```json
{
  "planId": "monthly",
  "opaqueData": {
    "dataDescriptor": "COMMON.ACCEPT.INAPP.PAYMENT",
    "dataValue": "<Accept.js nonce>"
  }
}
```

| Field | Required |
|-------|----------|
| `planId` | `"monthly"` or `"yearly"` |
| `opaqueData.dataDescriptor` | Accept.js se |
| `opaqueData.dataValue` | Accept.js se |

Monthly: `startsAt` + 1 month. Yearly: + 1 year.

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Payment successful",
  "data": {
    "membership": { "...": "activated Membership" },
    "isMember": true,
    "requiresPlan": false,
    "payment": {
      "transactionId": "...",
      "authCode": "...",
      "accountNumber": "XXXX1234",
      "accountType": "Visa",
      "amount": 9.99,
      "planId": "monthly",
      "planLabel": "Monthly"
    }
  }
}
```

Emails fail ho to bhi payment **success** maani jati hai.

**Errors:**

| HTTP | Message |
|------|---------|
| `401` | `"Authentication required"` |
| `400` | `"Invalid membership plan."` |
| `400` | `"Payment token is required. Tokenize the card with Accept.js first."` |
| `400` / `500` | Authorize.Net decline / config (`"Payment is not configured."`) |

**Frontend after success:** `isMember = true`, paywall hatao, chat/upload enable.

---

## 7. File APIs — `/api/v1/file`

MinIO/S3-style public URLs. **Login + active membership** dono chahiye.

### 7.1 Upload

```
POST /api/v1/file/upload
```

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `file` | File | Yes |

Folder auto:

| Extension | Folder |
|-----------|--------|
| png, jpg, jpeg, gif, webp | `images/` |
| mp4, mov, avi, mkv | `videos/` |
| mp3, wav, m4a, … | `audios/` |
| pdf, doc, docx, xls, xlsx | `documents/` |
| other | `general/` |

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Uploaded successfully",
  "data": {
    "key": "images/uuid.jpg",
    "url": "https://<public-base>/images/uuid.jpg",
    "name": "photo.jpg",
    "size": 12345,
    "extension": "jpg"
  }
}
```

Agar `file` missing ho: **HTTP 200** with `"No file uploaded"` aur `data: null`. Frontend `data === null` ko error treat kare.

---

### 7.2 Delete

```
POST /api/v1/file/delete
```

**Body:**

```json
{
  "identifier": "https://<public-base>/images/uuid.jpg"
}
```

`identifier` full URL **ya** storage key (`images/uuid.jpg`) ho sakta hai.

**Success:**

```json
{
  "statusCode": "10000",
  "message": "Deleted successfully",
  "data": {
    "key": "images/uuid.jpg",
    "message": "File deleted successfully"
  }
}
```

Missing `identifier`: HTTP 200, `"File URL or key is required"`, `data: null`.

---

### 7.3 Update (replace)

```
PUT /api/v1/file/update
```

**multipart:**

| Field | Type |
|-------|------|
| `file` | new file (required) |
| `oldFileUrl` | purani URL/key (optional; di ho to pehle delete) |

Success shape upload jaisi. Missing file → 200 + `data: null`.

---

## 8. Chat API — `/api/v1/chat`

Site assistant (movies, membership, auditions, contact). **Login + membership** required.

```
POST /api/v1/chat
```

**Body:**

```json
{
  "messages": [
    { "role": "user", "content": "How do I become a member?" },
    { "role": "assistant", "content": "You can choose Monthly or Yearly..." },
    { "role": "user", "content": "What is the yearly price?" }
  ]
}
```

| Rule | Limit |
|------|--------|
| `messages` | array, last item **must** be `role: "user"` |
| roles | only `"user"` \| `"assistant"` |
| max messages used | last **20** |
| max content length | **2000** chars (trim) |

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "OK",
  "data": {
    "reply": "Yearly membership is **$89.99**. You can subscribe from the [membership](/membership) page."
  }
}
```

`reply` **Markdown** ho sakta hai (bold, internal links jaise `[Browse movies](/movies)`). UI mein markdown render karo.

**Errors:**

| HTTP | Message |
|------|---------|
| `403` | membership required |
| `400` | `"Messages are required."` |
| `400` | `"A user message is required."` |
| `500` | `"Assistant is not configured..."` / `"Something went wrong..."` |

Bot **forms submit / payment / account change nahi** kar sakta — un pages pe redirect karwao.

---

## 9. Contact API — `/api/v1/contact`

Public contact form. Auth nahi chahiye.

```
POST /api/v1/contact
```

**Body:**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "subject": "general",
  "message": "I would like to know more about partnerships.",
  "company": ""
}
```

| Field | Required | Rules |
|-------|----------|--------|
| `name` | Yes | non-empty, max 120 |
| `email` | Yes | valid, max 254 |
| `subject` | Yes | exactly one of below |
| `message` | Yes | 10–5000 chars |
| `company` | No | **honeypot** — UI mein hidden rakhna |

**`subject` values (keys, labels nahi):**

| Value | Meaning |
|-------|---------|
| `general` | General Inquiry |
| `partnership` | Partnership |
| `press` | Press & Media |
| `careers` | Careers |

**Honeypot:** agar `company` non-empty ho, API **fake success** deti hai (bots ke liye). Real form pe `company` empty / omit karo.

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Message sent successfully",
  "data": {
    "id": "uuid",
    "received": true
  }
}
```

Studio ko email jati hai; optional auto-reply user ko.

**Errors:**

| HTTP | Example |
|------|---------|
| `400` | `"Please enter your name."` |
| `400` | `"Please enter a valid email address."` |
| `400` | `"Please select a subject."` |
| `400` | `"Please enter a message (at least 10 characters)."` |
| `400` | `"Message is too long. Please shorten it."` |
| `500` | `"Email is not configured..."` / `"Unable to send your message right now..."` |

Contact mein email fail → request **fail** (audition se different).

---

## 10. Audition API — `/api/v1/audition`

Homepage / auditions form: naam, email, **video + photo**. Public hai. Agar user logged-in ho to Bearer bhej sakte ho — submission `userId` se link ho jati hai. Token invalid ho to bhi request **chal jati hai** (optional auth).

```
POST /api/v1/audition/submit
```

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Limit |
|-------|------|----------|--------|
| `firstName` | text | Yes | — |
| `lastName` | text | Yes | — |
| `email` | text | Yes | valid email |
| `video` | file | Yes | max **100MB** |
| `photo` | file | Yes | max **10MB** |

Field names exact: `video`, `photo` (multer `fields`).

**Success `200`:**

```json
{
  "statusCode": "10000",
  "message": "Audition submitted successfully",
  "data": {
    "id": "uuid",
    "videoUrl": "https://.../auditions/video/uuid.mp4",
    "photoUrl": "https://.../auditions/photo/uuid.jpg",
    "emailSent": true,
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "createdAt": "2026-08-24T12:00:00.000Z"
  }
}
```

Files pehle storage pe jati hain, phir DB. Email fail ho to bhi **success** — `emailSent: false` ho sakta hai. UI success toast dikhao; `emailSent` optional note.

**Errors:**

| HTTP | Message |
|------|---------|
| `400` | `"First and last name are required."` |
| `400` | `"A valid email is required."` |
| `400` | `"Audition video and photo are required."` |
| `400` | `"Video must be 100MB or smaller."` |
| `400` | `"Photo must be 10MB or smaller."` |
| `500` | upload/storage unreachable |

Multer overall limit: **100MB**, max **2** files.

---

## 11. Error format (sab APIs)

Typical error JSON:

```json
{
  "statusCode": "10001",
  "message": "Membership required. Please choose a plan to continue."
}
```

| HTTP | `statusCode` | Kab |
|------|----------------|-----|
| 200 | `10000` | Success |
| 400 | `10001` | Validation / bad input |
| 401 | `10001` | Auth failure / missing Bearer |
| 401 | `10003` | Access token invalid/expired (`instruction: refresh_token`) |
| 403 | `10001` | Forbidden (no membership) |
| 404 | `10001` | Unknown route |
| 409 | `10001` | Conflict (rare) |
| 500 | `10001` | Server / mail / payment / OpenAI |

`404` response mein `url` (requested path) bhi ho sakta hai.

Frontend mapping (suggested):

| Situation | UI |
|-----------|-----|
| `401` + `10003` | Session expired → login |
| `401` other | Login required |
| `403` membership | Paywall / choose plan |
| `400` | Form field error (`message` dikhao) |
| `500` | Generic retry toast |

---

## 12. Recommended frontend flows

### A. Email signup → member features

```
POST /auth/signup
  → save tokens
  → if data.requiresPlan → show plans (GET /membership/config)
  → Accept.js tokenize
  → POST /membership/pay
  → isMember true → enable Chat + File upload
```

### B. App boot (already has token)

```
GET /auth/me
  → 401 → login screen
  → 200 → hydrate user
  → if requiresPlan → paywall
  → else → full app
```

### C. Contact page

```
POST /contact  { name, email, subject, message }
  → success toast
```

Hidden input `company` bots ke liye; humans ke liye empty.

### D. Audition (homepage)

```
POST /audition/submit  multipart (firstName, lastName, email, video, photo)
  optional: Authorization if logged in
```

### E. Chat widget

```
only if isMember
POST /chat  { messages: [...conversation, { role: "user", content }] }
  → append data.reply as assistant
```

---

## 13. Axios / fetch cheatsheet

```ts
const API_BASE = "https://<HOST>/api/v1";

function authHeaders(accessToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

// JSON
await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify({ email, password }),
});

// Multipart (do NOT set Content-Type; browser boundary set karega)
const form = new FormData();
form.append("file", file);
await fetch(`${API_BASE}/file/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

---

## 14. Jo APIs nahi hain (confusion avoid)

Yeh cheezein schema/service mein hon sakti hain, **lekin HTTP route nahi**:

| Missing | Note |
|---------|------|
| Refresh token API | Token expire → re-login |
| Forgot / reset password | Nahi |
| Email verify endpoint | Field DB mein hai, public API nahi |
| Apple OAuth routes | Service code hai, `/auth/apple` route nahi |
| Profile update API | User update ka public route nahi |
| Admin user CRUD | Public API tree mein nahi |
| List auditions / contacts | Submit-only (studio email + DB) |

---

## 15. Quick copy-paste: auth + plan flags

Har login-like response se ye store karo:

```ts
type AuthPayload = {
  user: User;
  tokens?: { accessToken: string; refreshToken: string };
  isMember: boolean;
  requiresPlan: boolean;
  membership: Membership | null;
};
```

Gate:

```ts
const canUseMemberFeatures = !auth.requiresPlan; // chat + file
```

`SUPER_ADMIN` ke liye `requiresPlan` hamesha `false` hota hai.
