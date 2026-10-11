# Phase 15 — Security Review

ตรวจเมื่อ 15 กันยายน 2569 สำหรับระบบในโฟลเดอร์ outputs/book-queue รุ่น 15.0.0 ตามขอบเขตโปรเจ็กต์ที่รันบน localhost

## ข้อค้นพบและการแก้ไข

| ข้อค้นพบ | การแก้ไข | หลักฐาน |
|---|---|---|
| ตัวนับ login ถูกอ่านก่อน await อ่าน body คำขอพร้อมกันอาจอ่านค่าก่อนหน้าเดียวกัน | อ่านและจอง attempt หลัง validate โดยไม่มี await ระหว่างอ่านกับเพิ่มค่า | security.test.js: 12 คำขอพร้อมกัน ได้ 401 จำนวน 10 และ 429 จำนวน 2 |
| JSON ขนาดเกินยังรออ่าน body จนครบ | ตรวจ Content-Length และ byte count ระหว่างอ่าน ตอบ 413 ก่อน upload จบ | security.test.js: declared length และ chunked ที่ยังไม่ end |
| บาง input ยอมรับ field ส่วนเกินและ JSON ไม่ได้ตรวจ UTF-8 | object/query allowlist, fatal UTF-8 decoder และ payload validation | security.test.js และ phase15.mysql.test.js |
| static file route อาศัย path ของระบบไฟล์และตรวจเฉพาะชื่อหน้าที่รู้จัก | allowlist ชื่อไฟล์จริงก่อนอ่านไฟล์ ปฏิเสธ alias/backup/ADS | security.test.js: trailing dot, space, ADS, encoded backslash, null, backup |
| หน้า private ตรวจเฉพาะ session ที่ยังไม่หมดอายุ | ตรวจบัญชียังอยู่ใน repository ทุกครั้งก่อนส่งหน้า | security.test.js: deleted admin, HEAD และตัวพิมพ์ใหญ่ |
| error handler เปิดเผยข้อความจาก error ใด ๆ ที่มี status | แสดงเฉพาะ HttpError ที่ระบบสร้างเอง ส่วน error อื่นคืนข้อความทั่วไป | security.test.js: dependency error พร้อม status และข้อความลับ |

## หลักฐานตรวจฟังก์ชันเดิม

- auth.test.js: hash สุ่ม salt, รหัสผิด, session ปลอม/หมดอายุ/เปลี่ยน token, logout, ไม่ส่ง password ใน profile, query ใช้ parameter
- phase4.mysql.test.js และ phase5.mysql.test.js: ตรวจ Catalog และ Slots บน MySQL จริง รวมข้อจำกัดข้อมูลที่มีประวัติจอง
- phase6.mysql.test.js: จองย้อนหลัง รอบปิด/เต็ม จองผิดกลุ่ม แย่งที่นั่งสุดท้าย จองซ้ำพร้อมกัน ลดความจุแข่งกับการจอง และ rollback เมื่อสร้างใบรับไม่สำเร็จ
- phase7.mysql.test.js และ qr.test.js: QR เฉพาะเจ้าของ รายการที่ไม่อนุญาต และการอ่าน QR จริง
- phase8.mysql.test.js และ scanner.test.js: ตรวจ token/สถานะ ยืนยันรับหนังสือซ้ำ การแสดงข้อความ และการคืนผลเมื่อขาดการเชื่อมต่อ
- phase9.mysql.test.js และ cancellation.test.js: ยกเลิกเฉพาะเจ้าของ ก่อนเริ่มรอบและสถานะที่อนุญาต ไม่คืนที่นั่งซ้ำ
- phase11.mysql.test.js, phase12.mysql.test.js, phase13.mysql.test.js, reports.test.js: Dashboard/Filter/Report ตรวจสิทธิ์ input และ CSV formula escaping
- phase14.mysql.test.js และ announcements.test.js: ประกาศใหม่สุด ส่งซ้ำไม่สร้างซ้ำ ข้อความ HTML ไม่ทำงานเป็นสคริปต์
- phase15.mysql.test.js: สิทธิ์ API ทุกกลุ่ม ค่าตัวกรองซ้ำ field ส่วนเกิน DELETE body และ SQL payload บนฐานทดสอบจริง

ผลรวม **175 tests, pass 175, fail 0, skipped 0** ใช้ RUN_MYSQL_TESTS=1 ไม่มีการทดสอบเขียนข้อมูลในฐานใช้งานจริง

Browser ใช้ฐานแยกชื่อสุ่ม: ตรวจ anonymous/Student ถูกส่งกลับหน้า Admin Login, Admin login และเพิ่มหนังสือภาษาไทยสำเร็จ, HTML แสดงเป็นข้อความ ไม่พบ console error/warning ในช่วงตรวจ

ตรวจฐานใช้งานจริงแบบอ่านเฉพาะจำนวน: students 2 บัญชี และ admins 1 บัญชี รูปแบบ password ตรง scrypt พร้อม salt/hash ทุกบัญชี (invalid 0) ไม่พิมพ์ค่า password/hash และไม่เปลี่ยนรหัสผ่าน

## ขอบเขตการใช้งาน

ระบบยัง bind 127.0.0.1 และรับ Host localhost/127.0.0.1 ตามเดิม Session และตัวนับ login เก็บในหน่วยความจำ process; restart ต้อง login ใหม่และตัวนับเริ่มใหม่ จำกัดการลอง login ต่อ IP แยก Student/Admin เป็นช่วง 15 นาที โดย login สำเร็จล้างตัวนับของ IP นั้น การทดสอบนี้ไม่ใช่การประเมินการรองรับเครือข่ายสาธารณะ หลาย server หรือการตรวจช่องโหว่ dependency จากบริการภายนอก

ไม่มี migration, ไม่เปลี่ยนรหัสผ่าน, ไม่เพิ่มหน้าคิวสาธารณะ และยังไม่เริ่ม Phase 16

## เพิ่มเติม Feature 2 (18.2.0)

เปลี่ยนรหัสตรวจรหัสเดิม ส่วน reset นักศึกษาตรวจรหัส Admin ซ้ำ ใช้ transaction/row lock, scrypt, session recheck ก่อน UPDATE และเพิกถอน token ของบัญชีที่เปลี่ยนรหัสหลัง commit ป้องกัน Login ที่กำลังตรวจรหัสเก่าออก token หลังเพิกถอน จำกัดคำขอต่อบัญชี 5 ครั้ง/15 นาที ไม่มี plaintext password ใน response หรือ log จากโมดูลใหม่ ดู API-FEATURE-2.md และ TEST-RESULTS-FEATURE-2.md ยังจำกัด single-process localhost ไม่มี email recovery หรือ audit log เพิ่มใน Feature นี้
