# API — Phase 3

Base URL: http://localhost:3000 ใช้ JSON UTF-8, response Cache-Control: no-store และ Cookie ที่เบราว์เซอร์รับ/ส่งเอง ไม่ใช้ token ใน localStorage ไม่มี CORS สำหรับเว็บไซต์อื่น

## POST /api/auth/login

หน้าที่: ตรวจบัญชีนักศึกษาและ hash จาก MySQL สร้าง Session ใหม่ แล้วส่ง Profile ของบัญชีนั้น

Input: Content-Type: application/json

```json
{
  "student_code": "66309010001",
  "password": "your-chosen-password"
}
```

ตัวอย่าง 200 Output (รหัสผ่านตัวอย่างข้างบนไม่ใช่บัญชีที่เปิดใช้อัตโนมัติ):

```json
{
  "student": {
    "student_id": 1,
    "student_code": "66309010001",
    "first_name": "สมชาย",
    "last_name": "ใจดี",
    "department_id": 1,
    "department_name": "เทคโนโลยีสารสนเทศ",
    "education_level_id": 1,
    "education_level_name": "ปวส.2",
    "classroom_id": 1,
    "classroom_name": "ปวส.2/1",
    "phone": null,
    "email": "student@example.com"
  }
}
```

มี Set-Cookie: book_queue_session=<random-token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600 เมื่อใช้ค่าตั้งต้น ผลไม่ส่ง password/hash และไม่ส่ง session token ใน JSON

- 400: รูปแบบรหัสนักศึกษา/รหัสผ่านหรือ JSON ไม่ถูกต้อง
- 401: รหัสนักศึกษาหรือรหัสผ่านผิด ใช้ข้อความเดียวกันทั้งบัญชีไม่มีและรหัสผ่านผิด
- 413: body เกิน 4096 bytes
- 415: Content-Type ไม่ใช่ application/json
- 429: พยายาม Login เกินจำนวน มี Retry-After เป็นวินาที
- 503: ติดต่อฐานข้อมูลไม่ได้ ไม่มี SQL หรือข้อมูล connection ในข้อความ

Login ที่ล้มเหลวไม่สร้าง Session ใหม่และไม่ลบ Session เดิมที่ยังใช้ได้ Login สำเร็จจะเปลี่ยน token และเพิกถอน token เดิมของ request นั้น

## GET /api/auth/me

หน้าที่: ใช้ student_id จาก Session ค้น Profile ล่าสุดด้วย JOIN ตาม schema Phase 2

Input: Cookie book_queue_session ไม่มี request body และไม่รับ student_id เป็นตัวเลือกบัญชี

Output 200: รูปแบบ student เหมือน Login ทุกฟิลด์ ไม่มี password/hash

Output 401:

```json
{ "message": "กรุณาเข้าสู่ระบบใหม่" }
```

เกิดเมื่อไม่มี Session, token ผิด, หมดอายุ หรือไม่พบบัญชี/กลุ่มที่อ้างอิงแล้ว กรณีไม่พบบัญชีจะลบ Session ด้วย หาก query ฐานข้อมูลล้มเหลวตอบ 503

## POST /api/auth/logout

หน้าที่: ลบ Session ฝั่งเซิร์ฟเวอร์ และตั้ง Cookie อายุ 0

Input: Content-Type: application/json พร้อม body `{}` และ Cookie (ถ้ามี)

Output 200:

```json
{ "message": "ออกจากระบบแล้ว" }
```

เรียกซ้ำหรือ Cookie หมดอายุแล้วก็ได้ผล 200 โดยไม่เปิด Session ใหม่

## กติการ่วม

- method ผิดตอบ 405 พร้อม Allow; API ที่ไม่มีตอบ 404
- POST จาก origin อื่นตอบ 403 ต้องใช้เว็บบน origin เดียวกับ server และ JSON
- ระบบรับ Host เป็น localhost:port หรือ 127.0.0.1:port เท่านั้น เนื่องจากออกแบบให้ใช้บนเครื่องพัฒนา
- frontend fetch ใช้ credentials: same-origin ส่วน Cookie เป็น HttpOnly อ่านด้วย JavaScript ไม่ได้
- Static GET/HEAD จาก Phase 1 ยังมีอยู่ แต่ Home/Profile/Books/My Booking จะตอบ 302 กลับ Login หากไม่มี Session
- หน้าเจ้าหน้าที่เป็น public UI ตัวอย่าง ไม่มี Admin API หรือสิทธิ์ Admin ที่ใช้งานจริงใน Phase นี้
