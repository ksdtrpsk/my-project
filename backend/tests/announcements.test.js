const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/assets/announcements-ui.js'),'utf8');
function ui(api){
 const nodes={};const node=id=>nodes[id]??=( {value:'',disabled:false,textContent:'',innerHTML:'',addEventListener(type,fn){this[type]=fn;},querySelector(){return node('button');},reset(){node('announcement-title').value='';node('announcement-content').value='';}} );
 const context=vm.createContext({api,crypto:{randomUUID},document:{getElementById:node},window:{location:{replace(){}}},escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(source+'\nbindAnnouncementsUI();',context);
 return {node,run:code=>vm.runInContext(code,context),submit:()=>node('announcement-form').submit({preventDefault(){},currentTarget:node('announcement-form')})};
}
test('Announcement text is escaped, empty and failed loads remain distinct',async()=>{
 const screen=ui(async()=>({announcement:{title:'<img>',content:'<script>\nบรรทัดสอง',created_at:'2030-01-01'}}));
 await screen.run('loadLatestAnnouncement()');const html=screen.run('latestAnnouncementView()');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img>/);assert.match(html,/\nบรรทัดสอง/);
 const empty=ui(async()=>({announcement:null}));await empty.run('loadLatestAnnouncement()');assert.match(empty.run('latestAnnouncementView()'),/ยังไม่มีประกาศ/);
 const failed=ui(async()=>{throw new Error('offline');});await failed.run('loadLatestAnnouncement()');assert.match(failed.run('latestAnnouncementView()'),/โหลดประกาศไม่สำเร็จ/);assert.doesNotMatch(failed.run('latestAnnouncementView()'),/ยังไม่มีประกาศ/);
});
test('Double submit is blocked and lost-response retry uses same request id',async()=>{
 const posts=[];let fail=true;
 const screen=ui(async(url,body)=>{if(body){posts.push({...body});if(fail)throw new Error('lost');return {announcement:{}};}return {announcements:[]};});
 screen.node('announcement-title').value='ประกาศ';screen.node('announcement-content').value='เนื้อหา';
 const pending=screen.submit();await screen.submit();await pending;assert.equal(posts.length,1);
 fail=false;await screen.submit();assert.equal(posts.length,2);assert.equal(posts[0].request_id,posts[1].request_id);assert.match(screen.node('announcement-message').textContent,/สำเร็จ/);
 screen.node('announcement-title').value='ใหม่';screen.node('announcement-content').value='ใหม่';await screen.submit();assert.notEqual(posts[2].request_id,posts[1].request_id);
});
test('Successful publication followed by list failure stays successful and clears draft',async()=>{
 const screen=ui(async(url,body)=>{if(body)return {announcement:{}};throw new Error('offline');});
 screen.node('announcement-title').value='หัวข้อ';screen.node('announcement-content').value='เนื้อหา';await screen.submit();
 assert.match(screen.node('announcement-message').textContent,/เผยแพร่สำเร็จแล้ว/);assert.equal(screen.node('announcement-title').value,'');assert.equal(screen.node('button').disabled,false);
});
