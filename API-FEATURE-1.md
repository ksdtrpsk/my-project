# Feature 1 — Student Management API

> บันทึกย้อนหลังของ Feature 1: ปัจจุบัน Feature 2 เพิ่มเปลี่ยนรหัสและรีเซ็ตนักศึกษาแล้ว ดู FEATURE-2.md และ API-FEATURE-2.md ข้อความว่าไม่มีฟังก์ชันรหัสผ่านด้านล่างเป็นสถานะก่อน Feature 2

Base URL http://localhost:3000 ใช้ Admin cookie book_queue_admin_session และตรวจว่าบัญชีเจ้าหน้าที่ยังมีอยู่ทุกคำขอ Student session ใช้ไม่ได้ การเขียนรับ JSON และตรวจ same origin เช่น API เดิม ไม่มี endpoint รีเซ็ตรหัสผ่านหรือลบนักศึกษา

## เส้นทาง

| Method | Endpoint | Input | Output / หน้าที่ |
|---|---|---|---|
| GET | /api/admin/students | q, page ตาม Phase 16 | 200 {students,total,page,page_size} ค้นรายชื่อ รูปแบบเดิมไม่เพิ่มรหัสลับหรือ contact ใน list |
| GET | /api/admin/students/:id | id จำนวนเต็มบวก | 200 {student,version,has_bookings} เปิดรายละเอียดเพื่อแก้ไข |
| POST | /api/admin/students | profile + password | 201 {student} สร้างบัญชีใหม่ |
| PUT | /api/admin/students/:id | profile + version | 200 {student} แก้ข้อมูลโดยคง password เดิม |
| POST | /api/admin/students/groups | department_name, education_level_name, classroom_name | 201 {group:{department_id,education_level_id,classroom_id}} สร้างหรือใช้กลุ่มเดิม |
| POST | /api/admin/students/import/preview | {csv:string} | 200 {rows,total,valid} ตรวจไฟล์โดยไม่เขียน DB |
| POST | /api/admin/students/import | {csv:string,password:string} | 201 {created,message} ตรวจใหม่แล้วสร้างบัญชีทุกแถวพร้อมกัน |

เส้นทางใหม่ไม่รับ query parameter ส่วน list คง q/page เท่านั้น ไม่รับชื่อ query ซ้ำ รหัส :id รับช่วง 1–4294967295 ไม่รับเลขทศนิยม ชื่อเส้นทางไม่รู้จักคืน 404 method ที่ไม่รองรับคืน 405 พร้อม Allow

## Profile

POST ตัวอย่างใช้ classroom_id ที่มีจริงใน /api/admin/lookups (ID ตัวอย่างไม่ใช่ค่าคงที่):

```json
{
  "student_code": "00990001",
  "first_name": "นักศึกษา",
  "last_name": "ตัวอย่าง",
  "classroom_id": 10,
  "phone": null,
  "email": null,
  "password": "Replace-With-Your-Password"
}
```

profile ประกอบด้วย student_code, first_name, last_name, classroom_id และ phone/email ที่ละได้หรือใช้ null ไม่รับ student_id, department_id, education_level_id หรือ field อื่น กลุ่ม derive จากห้องฝั่ง server รายละเอียดขนาดข้อความดู FEATURE-1.md รหัสผ่านเริ่มต้น 12–128 ตัวอักษร เก็บ scrypt hash ไม่คืนใน response

GET detail คืน student_id, student_code, first_name, last_name, department_id, education_level_id, classroom_id, phone, email ภายใน student ไม่คืน password/hash ส่วน version เป็น SHA-256 ของข้อมูล profile ที่อ่านมา ใช้ตรวจ stale update ไม่ใช่ token ยืนยันตัวตนหรือ hash รหัสผ่าน

PUT ส่ง profile ครบเหมือน POST แต่ **ห้ามส่ง password** ให้ส่ง version จาก GET แทน เมื่ออ่านแล้วมีการแก้ข้อมูลก่อน PUT จะได้ 409 ต้องเปิด detail ใหม่ การตรวจประวัติและแก้ไขล็อก student row เหมือนการสร้าง Booking เพื่อป้องกันเปลี่ยนกลุ่มชนกับการจอง

ถ้ามีประวัติจองใด ๆ รวม CANCELLED ห้ามเปลี่ยน student_code/classroom_id แต่แก้ชื่อ นามสกุล โทรศัพท์และอีเมลได้ รหัสผ่านไม่เปลี่ยน และไม่เปลี่ยนรายการจอง

## CSV

ส่งเนื้อหา UTF-8 ใน JSON csv ไม่ใช่ multipart file ไม่ส่งรหัสผ่านในไฟล์ CSV ใช้คอลัมน์ใน database/students-template.csv ขนาด CSV สูงสุด 204800 bytes, 1–100 แถวข้อมูล ไม่รับหัวที่ไม่รู้จักหรือซ้ำ parser รองรับ BOM, CRLF/LF, quoted comma และ doubled quotes ข้อมูลที่มี control characters ไม่ผ่าน validation

ตัวอย่าง preview:

```json
{
  "total": 1,
  "valid": true,
  "rows": [{
    "row": 2,
    "student_code": "00990001",
    "first_name": "นักศึกษา",
    "last_name": "ตัวอย่าง",
    "department_name": "บัญชี",
    "education_level_name": "ปวส.2",
    "classroom_name": "2/1",
    "phone": null,
    "email": null,
    "errors": [],
    "new_group": true
  }]
}
```

แถวผิดมี row, student_code, errors และอาจไม่มี field ที่ตรวจไม่ผ่าน valid=false ยังคง HTTP 200 เพราะเป็นผลตรวจ ส่วนโครงสร้าง CSV ผิดจนอ่านไม่ได้คืน 400 ฟิลด์ new_group แสดงเฉพาะแถวที่ตรวจข้อมูลพื้นฐานผ่าน

เมื่อ import ต้องส่ง CSV เดียวกับที่ผู้ใช้ตรวจในหน้าจอพร้อม password เซิร์ฟเวอร์ไม่เชื่อ preview เดิมและตรวจใหม่ทุกครั้ง ใช้ Unique Key และ transaction ป้องกันเขียนทับ/นำเข้าไม่ครบ กรณีมี error ไม่มีการบันทึกแถวใด ไม่ skip รหัสที่มีอยู่ หากมี import กำลังทำใน process เดียวกันจะได้ 409 ให้รอแล้วตรวจไฟล์ใหม่ ต่าง process ยังถูกป้องกันด้วย transaction/unique constraint

รหัสผ่านเริ่มต้นใช้กับทุกบัญชีในไฟล์ แต่สร้าง salt แยกแต่ละคน การ retry ที่เคย commit แล้วจะพบรหัสซ้ำและปฏิเสธ ไม่แก้รหัสผ่านเดิม

## HTTP errors และขนาดคำขอ

| Status | ความหมาย |
|---|---|
| 400 | Input/JSON/query ผิด รหัสเริ่มต้นผิดขนาด หรือ CSV ไม่ผ่าน |
| 401 | ไม่มี session หรือบัญชีเจ้าหน้าที่ถูกลบ |
| 403 | ใช้ Student session หรือส่งการเขียนข้าม origin |
| 404 | ไม่พบนักศึกษาหรือเส้นทาง |
| 405 | Method ไม่รองรับ |
| 409 | รหัสซ้ำ มีประวัติจองตอนเปลี่ยนกลุ่ม ข้อมูลแก้ชนกัน หรือ import กำลังทำ |
| 413 | JSON body ใหญ่เกินเพดาน |
| 415 | Content-Type ไม่ใช่ application/json |
| 503 | ฐานข้อมูลหรือข้อผิดพลาดภายใน ไม่เปิดเผย SQL/รหัสผ่าน |

เพดาน JSON: create/update 8192 bytes, groups 4096 bytes, import/preview 1310720 bytes เผื่อการ escape JSON ของ CSV แต่ตัว CSV ยังจำกัด 200 KB ทุก response เป็น no-store และ errors ใช้ {message} ไม่เพิ่ม dependency หรือ schema
