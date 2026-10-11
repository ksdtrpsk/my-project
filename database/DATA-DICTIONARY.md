# พจนานุกรมข้อมูล — Phase 2

PK ทุกตารางเป็น INT UNSIGNED AUTO_INCREMENT NOT NULL; FK ใช้ INT UNSIGNED NOT NULL คอลัมน์ที่ไม่ระบุว่า NULL ได้จำเป็นต้องมีค่า ยกเว้นคอลัมน์ที่มี default หรือคำนวณเอง

## departments

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| department_id | INT UNSIGNED, PK | รหัสสาขาภายใน |
| department_name | VARCHAR(100), UNIQUE | ชื่อสาขา เช่น เทคโนโลยีสารสนเทศ |

## education_levels

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| education_level_id | INT UNSIGNED, PK | รหัสระดับชั้น |
| education_level_name | VARCHAR(30), UNIQUE | ปวช.1, ปวช.2, ปวช.3, ปวส.1 หรือ ปวส.2 |

## classrooms

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| classroom_id | INT UNSIGNED, PK | รหัสห้องภายใน |
| department_id | INT UNSIGNED, FK | สาขาของห้อง |
| education_level_id | INT UNSIGNED, FK | ระดับชั้น |
| classroom_name | VARCHAR(30) | เช่น ปวส.2/1 ไม่ซ้ำภายในสาขาและระดับเดียวกัน |

## students

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| student_id | INT UNSIGNED, PK | รหัสภายใน ไม่ใช่รหัสบนบัตร |
| student_code | VARCHAR(20), ASCII, UNIQUE | รหัสบนบัตร เก็บข้อความเพื่อรักษาศูนย์นำหน้า |
| password | VARCHAR(255), ASCII | Hash รหัสผ่านเท่านั้น |
| first_name | VARCHAR(100) | ชื่อจริง |
| last_name | VARCHAR(100) | นามสกุล |
| department_id | INT UNSIGNED, composite FK | สาขา ต้องตรงกับห้อง |
| education_level_id | INT UNSIGNED, composite FK | ระดับ ต้องตรงกับห้อง |
| classroom_id | INT UNSIGNED, composite FK | ห้องเรียน |
| phone | VARCHAR(20), NULL ได้ | เบอร์โทร เก็บเป็นข้อความ |
| email | VARCHAR(254), NULL ได้ | ไม่ใช้ Login และไม่บังคับ unique |

## books

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| book_id | INT UNSIGNED, PK | รหัสหนังสือภายใน |
| book_name | VARCHAR(200) | ชื่อหนังสือ |
| book_code | VARCHAR(30), UNIQUE | รหัสหนังสือ |
| description | TEXT, NULL ได้ | รายละเอียด |

## book_sets

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| book_set_id | INT UNSIGNED, PK | รหัสชุด |
| department_id | INT UNSIGNED, composite FK | สาขา |
| education_level_id | INT UNSIGNED, composite FK | ระดับ |
| classroom_id | INT UNSIGNED, composite FK | ห้องที่รับชุดนี้ |
| semester | TINYINT UNSIGNED | 1, 2 หรือ 3 (ฤดูร้อน) |
| academic_year | SMALLINT UNSIGNED | พ.ศ. ช่วง 2500–2999 |

Unique Key รวมกลุ่มและภาคเรียน/ปีการศึกษา ป้องกันหลายชุดสำหรับกลุ่มและเทอมเดียว

## book_set_items

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| id | INT UNSIGNED, PK | รหัสรายการ |
| book_set_id | INT UNSIGNED, FK | ชุดหนังสือ |
| book_id | INT UNSIGNED, FK | หนังสือ ได้หนึ่งเล่มต่อรายการ |

Unique Key (book_set_id, book_id) ป้องกันหนังสือซ้ำในชุด

## booking_slots

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| slot_id | INT UNSIGNED, PK | รหัสรอบ |
| booking_date | DATE | วันที่ ค.ศ. |
| start_time | TIME | เวลาเริ่มภายในวัน |
| end_time | TIME | เวลาจบ ต้องมากกว่าเริ่ม |
| max_students | SMALLINT UNSIGNED | จำนวนรับสูงสุด มากกว่า 0 |
| status | VARCHAR(10), ASCII | OPEN หรือ CLOSED; default OPEN |

Unique Key (booking_date, start_time, end_time) ป้องกันรอบซ้ำ แต่ไม่ตรวจเวลาทับซ้อน

## bookings

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| booking_id | INT UNSIGNED, PK | รหัสจอง |
| student_id | INT UNSIGNED, FK | นักศึกษาผู้จอง |
| slot_id | INT UNSIGNED, FK | รอบที่เลือก |
| book_set_id | INT UNSIGNED, FK | เพิ่มเพื่อผูกสิทธิ์รับแต่ละชุด |
| queue_number | VARCHAR(20), ASCII | เลขคิวไม่ซ้ำใน slot เดียวกัน |
| qr_code | VARCHAR(128), ASCII, NULL ได้, UNIQUE | Token QR ไม่เก็บข้อมูลส่วนตัว |
| booking_status | VARCHAR(15), ASCII | WAITING, CHECKED_IN, RECEIVED, CANCELLED, NO_SHOW; default WAITING |
| created_at | DATETIME | เวลาสร้าง default CURRENT_TIMESTAMP |
| received_at | DATETIME NULL | เพิ่มใน Phase 8: เวลายืนยันรับจริงตามเวลาไทย เป็น NULL จนกว่าจะยืนยัน ไม่มีการเติมเวลาสมมติให้ประวัติเดิม |
| booking_guard | TINYINT, generated STORED, NULL ได้ | เพิ่มเพื่อให้ Unique Key ยกเว้น CANCELLED |

สถานะใช้ VARCHAR + CHECK เพื่อให้ค่าที่อนุญาตอ่านได้ใน schema ใช้ ASCII binary collation เทียบตัวพิมพ์ตรงกัน

## admins

| คอลัมน์ | ชนิด | ความหมาย |
| --- | --- | --- |
| admin_id | INT UNSIGNED, PK | รหัสเจ้าหน้าที่ |
| username | VARCHAR(50), ASCII, UNIQUE | ชื่อ Login แยกตัวพิมพ์เล็ก/ใหญ่ |
| password | VARCHAR(255), ASCII | Hash เท่านั้น |
| name | VARCHAR(150) | ชื่อแสดงผล |

## ดัชนีเพิ่มเติม

- students: (department_id, education_level_id, classroom_id) สำหรับดึงนักศึกษาตามกลุ่ม
- booking_slots: (booking_date, status) สำหรับรอบตามวันและสถานะ
- bookings: (slot_id, booking_status) สำหรับนับและแสดงการจองในรอบ
- bookings: (booking_status, created_at) สำหรับรายการตามสถานะและช่วงเวลา
- Unique Key แสดงครบใน schema.sql; InnoDB สร้างดัชนี Foreign Key ให้อัตโนมัติหากยังไม่มีดัชนีที่ใช้ได้

## Phase 14: announcements

| Field | Type | ความหมาย |
|---|---|---|
| announcement_id | INT UNSIGNED PK AUTO_INCREMENT | รหัสประกาศ |
| title | VARCHAR(160) NOT NULL | หัวข้อ |
| content | TEXT NOT NULL | เนื้อหา 1–5,000 ตัวอักษรหลัง trim |
| created_by | INT UNSIGNED NULL FK admins | เจ้าหน้าที่ผู้สร้าง ลบผู้สร้างแล้ว SET NULL |
| request_id | CHAR(36) ASCII UNIQUE NOT NULL | UUID v4 ป้องกันส่งซ้ำ |
| created_at | DATETIME NOT NULL | เวลาประกาศประเทศไทย กำหนดจาก server |

Index (created_at, announcement_id) รองรับรายการใหม่สุด; CHECK หัวข้อและเนื้อหาไม่ว่าง เก็บประกาศแยกจากข้อมูลการจอง
