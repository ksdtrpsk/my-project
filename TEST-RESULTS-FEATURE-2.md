# ผลทดสอบ Feature 2

วันที่ 21 กันยายน 2569 รุ่น 18.2.0

รัน npm test พร้อม RUN_MYSQL_TESTS=1: **230 tests, pass 230, fail 0, skipped 0** รวม Feature 1 และชุด regression ของการจองเดิม

## HTTP และ MySQL จริง (ฐานสุ่มแยก)

| กรณี | ผลที่ตรวจ |
|---|---|
| รหัสเดิมผิด ยืนยันไม่ตรง และใช้รหัสเดิมซ้ำ | ปฏิเสธ ไม่เปลี่ยน hash หรือ profile; session เดิมยังใช้ได้ |
| Student เปลี่ยนรหัสสำเร็จ | hash เปลี่ยน รหัสเดิม Login ไม่ได้ รหัสใหม่ Login ได้ |
| หลาย session | token ของนักศึกษาคนนั้นทุกเครื่องใช้ API ไม่ได้ หน้า protected กลับ Login; บัญชีอื่นและ Admin ยังใช้ได้ |
| Booking/QR | แถว bookings ทุกคอลัมน์และ profile ที่ไม่ใช่ password เท่าเดิม หลัง Login ใหม่ยังเห็นการจอง |
| Admin reset | ต้องใช้รหัส Admin และ student_code ถูกคน; reset แล้วรหัสเก่าใช้ไม่ได้ |
| ตรวจสิทธิ์/input | ไม่มี session, Student เรียก Admin, cross-origin, query เพิ่ม, method ผิด และบัญชี Admin ถูกลบ ถูกปฏิเสธ |
| จำกัดการลองรหัส | ผิดครบ 5 ครั้ง ครั้งถัดไป 429 และ hash ไม่เปลี่ยน |
| การส่งพร้อมกัน | self-change สองคำขอได้ผลสำเร็จเพียงหนึ่ง รหัสที่ชนะใช้ Login ได้ |
| ฐานข้อมูลล้มเหลว | จำลอง error หลัง UPDATE ก่อน commit: rollback รหัสและ session เดิมยังใช้ได้ |
| Admin self-change | รองรับขั้นต่ำ 6 ตัวตามนโยบายเดิม เพิกถอน Admin sessions ทุก token และใช้รหัสใหม่ Login ได้ |

ทั้งหมดผ่าน อยู่ใน backend/tests/feature2.mysql.test.js ไม่เปลี่ยนรหัสบัญชีฐานใช้งานจริง

## Unit และ UI จำลอง

- แยกขั้นต่ำ Admin/Student, ยืนยันรหัส และ field ที่ไม่รองรับ
- เพิกถอน session ทุก token เฉพาะบัญชีเป้าหมาย
- จำลอง Login ที่หยุดรอก่อนออก session แล้วมีการเพิกถอน: ไม่ออก cookie จากรหัสเก่า คืน 409
- ยืนยันรหัสไม่ตรงไม่ส่ง API กดบันทึกซ้ำส่งเพียงครั้งเดียว
- หลังสำเร็จล้างช่องรหัสและแสดงลิงก์ Login ที่ตรงบทบาท
- Reset ส่ง id/code เป้าหมายถูกต้องและไม่ retry อัตโนมัติเมื่อเครือข่ายขาด
- รหัสผิดยังแสดงฟอร์มได้ ส่วน session หมดอายุกลับ Login

หลักฐาน: backend/tests/password-management.test.js และ backend/tests/password-ui.test.js

## Browser

ตรวจด้วยบัญชี fixture แยก: Admin Login เปิดเมนูเปลี่ยนรหัส เห็นขั้นต่ำ 6 ตัว และเปิด Students → รีเซ็ตรหัส เห็นชื่อ/รหัสนักศึกษาเป้าหมาย ช่องรหัสเจ้าหน้าที่และยืนยันใหม่ นักศึกษา Login เปิดเมนูเปลี่ยนรหัส เห็นขั้นต่ำ 12 ตัว ตรวจฟอร์ม reset ที่ 390px ด้วย screenshot ไม่มี document overflow แนวนอน และไม่พบ console error ในเส้นทางที่ตรวจ

การ submit เปลี่ยนรหัสจน Login ใหม่ตรวจด้วย automated HTTP/MySQL และ UI จำลองตามข้างต้น ไม่อ้างว่าได้กรอกรหัสใหม่และกดยืนยันผ่าน browser หรือเปลี่ยนรหัสบัญชีจริงของผู้ใช้

## รันซ้ำ

```powershell
$env:RUN_MYSQL_TESTS='1'
try { npm test } finally { Remove-Item Env:RUN_MYSQL_TESTS -ErrorAction SilentlyContinue }
```

ต้องให้บัญชี MySQL ใน .env มีสิทธิ์สร้าง/ลบฐานทดสอบ ชื่อฐานเป็น bq_feature2_test_ ตามด้วย hex สุ่ม 16 ตัว ตรวจรูปแบบก่อนล้าง ไม่ต้องล้าง bookings หรือ import schema บนฐานจริง การทดสอบนี้ไม่ได้ครอบคลุมการรันหลาย Node processes หรือ production deployment
