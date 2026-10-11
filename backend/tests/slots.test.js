const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slotInput, dateInput, bangkokNow } = require('../slots');
test('Slot calendar and time validation rejects rollover, invalid capacities and reversed periods', () => {
  const good = { booking_date: '2028-02-29', start_time: '09:00', end_time: '09:30', max_students: 20, status: 'OPEN' };
  assert.equal(slotInput(good).start_time, '09:00:00');
  for (const value of ['2027-02-29','2028-02-30','2028-13-01','2028-1-01',null,"2028-01-01' OR 1=1"]) assert.throws(() => dateInput(value), { status: 400 });
  for (const patch of [{ start_time: '24:00' },{ end_time: '09:00' },{ end_time: '08:59' },{ max_students: 0 },{ max_students: 1.5 },{ max_students: '20' },{ max_students: 65536 },{ status: 'open' }]) assert.throws(() => slotInput({ ...good, ...patch }), { status: 400 });
});
test('Slot clock consistently uses Thailand date at the UTC day boundary', () => {
  assert.equal(bangkokNow(Date.parse('2026-09-13T17:01:02Z')), '2026-09-14 00:01:02');
});
