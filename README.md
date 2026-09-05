# Space Planner

## Cloudflare deployment (September 2026)

The Cloudflare deployment uses `worker/cloudflare.js`, `wrangler.jsonc`, and the `src/` frontend. The wrapper verifies Cloudflare Access JWT signatures, issuer, audience, and expiry before calling the existing planner API. Internet-supplied OpenAI identity headers are discarded.

- Build command: `node cloudflare-build.mjs`
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
- D1 binding: `DB` / `space-planner-db`
- Required runtime variables: `ACCESS_ISSUER` (the exact `https://<team>.cloudflareaccess.com` issuer) and `ACCESS_AUD` (the protecting Access application's audience tag). Configure these in the Worker dashboard; they are not passwords. Missing configuration deliberately rejects API access.
- Protect production and preview traffic with Cloudflare Access. Configure an email OTP identity provider. Application-level membership still restricts data access to the admin and explicitly invited members.
- Only `npodech@gmail.com` is the planner administrator. The Cloudflare hosting-account email is a separate identity and is not automatically an application administrator.
- Each member has their own planner data. A shared multi-user workspace is not implemented.
- Cloud data from the older ChatGPT Site is not automatically migrated. Export JSON there and import it after signing into the new deployment.
- Concurrent changes are no longer silently overwritten: the UI preserves pending local changes and asks which version to use. JSON export is available before resolving a conflict.
- Backend checks: `node --test worker/cloudflare.test.mjs` (Node 24). Checks identity spoofing, JWT validation, permissions, revoked access, isolation, position round trips, stale revisions and request origin.

Setup status: code prepared and D1 database created. Access activation, OTP configuration, runtime variables, production deployment and signed-in production validation are still required. For this account, Cloudflare's Zero Trust Free activation currently requests a payment method and authorization for usage above free limits. No payment details have been entered and no subscription has been activated by this setup.

GitHub Pages only serves static files. For cloud data and login, use the completed Cloudflare deployment URL after activation and validation, not the GitHub Pages URL.

เครื่องมือจัดแปลนพื้นที่กิจกรรม บูท เวที เสา และระยะร่น พร้อมข้อมูลร้านค้า ระบบสมาชิก และการบันทึกบน Cloud

## ไฟล์สำหรับเผยแพร่แบบหน้าเว็บ

- `index.html`
- `app.js`
- `styles.css`
- `assets/approved-plan.png`

ไฟล์ชุดนี้สามารถใช้กับ GitHub Pages สำหรับหน้าตาเว็บไซต์ได้ แต่ระบบสมาชิกและการบันทึก Cloud ต้องใช้ Worker และฐานข้อมูลจากโฟลเดอร์ `worker`, `db` และ `drizzle`

## โครงสร้างซอร์สหลัก

- `src/` หน้าเว็บไซต์และไฟล์แปลน
- `worker/` API สำหรับบัญชีผู้ใช้และข้อมูล Cloud
- `db/` โครงสร้างฐานข้อมูล
- `drizzle/` ไฟล์อัปเดตฐานข้อมูล
- `.openai/hosting.json` การตั้งค่าเว็บไซต์ที่เผยแพร่

บัญชีผู้ดูแลระบบหลักกำหนดไว้ฝั่งเซิร์ฟเวอร์ และสมาชิกทั่วไปต้องถูกเพิ่มจากหน้า “จัดการสมาชิก” ก่อนจึงจะบันทึกข้อมูลบน Cloud ได้

## Backend และการซิงค์ (v12)

- เว็บไซต์จริงใช้ Cloudflare Worker และ D1 ผ่านไฟล์ใน `worker/`, `db/` และ `drizzle/`
- การบันทึกถูกจัดคิวเพื่อไม่ให้คำสั่งหลายรายการเขียนทับกัน
- ตรวจจับ revision conflict เมื่อเปิดบัญชีเดียวกันหลายอุปกรณ์ และลองซิงค์ข้อมูลล่าสุดโดยไม่ทิ้งฉบับที่กำลังแก้
- Admin Developer สามารถเพิ่ม ลบ และกำหนดสมาชิกเป็น “แก้ไขแปลน” หรือ “ดูอย่างเดียว”
- GitHub Pages เป็นหน้าเว็บแบบ Static จึงใช้สำหรับดูตัวอย่างและสำรองซอร์ส ส่วน Cloud และระบบสมาชิกต้องใช้งานผ่านเว็บไซต์ที่เผยแพร่พร้อม Worker
