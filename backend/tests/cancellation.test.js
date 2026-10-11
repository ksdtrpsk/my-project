const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/booking-ui.js'),'utf8');
function setup(api,accept=true){
  const app={innerHTML:''};const button={disabled:false};
  const context=vm.createContext({api,window:{confirm:()=>accept,location:{replace(){}}},document:{querySelectorAll:()=>[button],getElementById:()=>app},shell:x=>x,bookingView:()=> 'updated',bindUI(){}});
  vm.runInContext(source+'\nbindBookingQr=()=>{};bindCancellationUI=()=>{};ownBookings=[{booking_id:1,booking_status:"WAITING",can_cancel:true}];',context);
  return {run:code=>vm.runInContext(code,context),button,app};
}
test('Cancellation confirmation can be declined without any request',async()=>{
  let calls=0;const ui=setup(async()=>{calls++;},false);await ui.run('cancelOwnBooking(1)');assert.equal(calls,0);
});
test('Cancellation prevents double click and applies server receipt',async()=>{
  let calls=0,release;const ui=setup(async(url,body)=>{calls++;assert.equal(url,'/api/student/bookings/1/cancel');assert.equal(JSON.stringify(body),'{}');await new Promise(resolve=>{release=resolve;});return {booking:{booking_id:1,booking_status:'CANCELLED',can_cancel:false}};});
  const pending=ui.run('cancelOwnBooking(1)');await ui.run('cancelOwnBooking(1)');assert.equal(ui.button.disabled,true);release();await pending;
  assert.equal(calls,1);assert.equal(ui.run('ownBookings[0].booking_status'),'CANCELLED');assert.match(ui.run('cancellationState.message'),/คืนคิวว่าง/);
});
test('Lost cancellation response recovers by read only lookup',async()=>{
  const calls=[];const ui=setup(async(url)=>{calls.push(url);if(url.endsWith('/cancel'))throw new Error('lost');return {bookings:[{booking_id:1,booking_status:'CANCELLED',can_cancel:false}]};});
  await ui.run('cancelOwnBooking(1)');assert.equal(calls.length,2);assert.equal(calls[1],'/api/student/bookings');assert.match(ui.run('cancellationState.message'),/ยกเลิกแล้ว/);
});
test('Unknown cancellation result disables further mutation until refresh',async()=>{
  let calls=0;const ui=setup(async()=>{calls++;throw new Error('offline');});await ui.run('cancelOwnBooking(1)');await ui.run('cancelOwnBooking(1)');assert.equal(calls,2);assert.equal(ui.run('ownBookings[0].can_cancel'),false);assert.match(ui.run('cancellationState.message'),/โหลดหน้าใหม่/);
});
