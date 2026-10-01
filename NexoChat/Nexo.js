document.addEventListener('DOMContentLoaded', async () => {
  const SUPABASE_URL = 'https://gaazbybuoddmhknhaqlm.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uXYQJ2KHXsw_8aKSXJSz6w_gxgbu95i';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const authPage=$('authPage'), profilePage=$('profilePage'), appPage=$('appPage'), welcomePage=$('welcomePage');
  let user=null, profile=null, isSignup=false, currentChat=null, realtime=null, notificationChannel=null;
  let friends=[], incoming=[], outgoing=[], groups=[];

  const esc = s => String(s??'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt = d => { const x=new Date(d); return x.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); };
  const avatar = (p, cls='avatar') => p?.avatar_url ? `<div class="${cls}"><img src="${esc(p.avatar_url)}" alt=""></div>` : `<div class="${cls}">${esc((p?.full_name||p?.username||'?').slice(0,1).toUpperCase())}</div>`;
  const toast = msg => { const t=$('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove('show'),2600); };
  const show = (el, yes) => el?.classList.toggle('hidden', !yes);
  const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b><div>${esc(text)}</div></div>`;

  function setPage(mode){ show(authPage,mode==='auth'); show(profilePage,mode==='profile'); show(appPage,mode==='app'); if(welcomePage) show(welcomePage,mode==='welcome'); }
  function setAvatarEls(p){
    ['sideAvatar','topAvatar'].forEach(id=>{const e=$(id); if(!e)return; e.innerHTML=p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p?.full_name||p?.username||'U').slice(0,1).toUpperCase());});
    $('sideName').textContent=p?.full_name||p?.username||'You'; $('sideHandle').textContent=p?.username?`@${p.username}`:''; $('topName').textContent=p?.full_name||p?.username||'You';
  }

  function authMode(){
    $('authEyebrow').textContent=isSignup?'CREATE ACCOUNT':'WELCOME BACK';
    $('authTitle').textContent=isSignup?'Create your NexoChat account':'Sign in to NexoChat';
    $('authSubtitle').textContent=isSignup?'Meet your people and start chatting.':'Your conversations are waiting for you.';
    $('submitButton').innerHTML=isSignup?'Create Account <span>→</span>':'Sign In <span>→</span>';
    $('switchAuth').innerHTML=isSignup?'Already have an account? <button id="switchButton" class="text-btn" type="button">Sign in</button>':'New to NexoChat? <button id="switchButton" class="text-btn" type="button">Create account</button>';
    $('switchButton').onclick=()=>{isSignup=!isSignup;authMode();};
  }
  $('togglePassword').onclick=()=>{const i=$('password');i.type=i.type==='password'?'text':'password';$('togglePassword').textContent=i.type==='password'?'Show':'Hide';};
  $('googleButton').onclick=async()=>{const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});if(error)toast(error.message);};
  $('forgotPassword').onclick=async()=>{const email=$('email').value.trim();if(!email)return toast('Enter your email first.');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.href});toast(error?error.message:'Password reset email sent.');};
  $('authForm').onsubmit=async e=>{e.preventDefault();const email=$('email').value.trim(),password=$('password').value;if(password.length<6)return toast('Password must be at least 6 characters.');$('submitButton').disabled=true;try{if(isSignup){const {data,error}=await sb.auth.signUp({email,password});if(error)throw error;if(data.user&&!data.session)toast('Account created. Check your email, then sign in.');else if(data.session)await afterAuth(data.user);}else{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await afterAuth(data.user);}}catch(err){toast(err.message||'Authentication failed.');}finally{$('submitButton').disabled=false;}};

  $('profilePhotoButton').onclick=()=>$('profilePhotoInput').click();
  $('profilePhotoInput').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024)return toast('Choose an image under 2MB.');const r=new FileReader();r.onload=()=>{$('profilePreview').src=r.result;$('profilePreview').hidden=false;$('photoPlaceholder').hidden=true;$('profilePhotoButton').dataset.avatar=r.result;};r.readAsDataURL(f);};
  $('finishProfile').onclick=saveProfile;

  async function afterAuth(u){ user=u; const {data,error}=await sb.from('profiles').select('*').eq('id',u.id).maybeSingle(); if(error && !/profiles/i.test(error.message)) return toast(error.message); profile=data||null; if(!profile?.username||!profile?.full_name){fillProfile();setPage('profile');}else{setAvatarEls(profile);setPage('app');await bootApp();} }
  function fillProfile(){ $('displayName').value=profile?.full_name||user?.user_metadata?.full_name||'';$('username').value=profile?.username||'';$('bio').value=profile?.bio||''; }
  async function saveProfile(){
    const full_name=$('displayName').value.trim(), username=$('username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,''); const bio=$('bio').value.trim();
    if(full_name.length<2)return toast('Enter your display name.');if(username.length<3)return toast('Username must be at least 3 characters.');
    const avatar_url=$('profilePhotoButton').dataset.avatar||profile?.avatar_url||null;
    const {data,error}=await sb.from('profiles').upsert({id:user.id,full_name,username,bio,avatar_url,updated_at:new Date().toISOString()},{onConflict:'id'}).select().single();
    if(error)return toast(error.message.includes('profiles')?'Run the NexoChat V1 schema in Supabase first.':error.message);
    profile=data;setAvatarEls(profile);setPage('app');await bootApp();
  }

  function nav(view){
    document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $(`view-${view}`)?.classList.remove('hidden');
    const titles={home:['CONVERSATIONS','Chats'],friends:['PEOPLE','Friends'],chats:['CONVERSATIONS','Chats'],groups:['YOUR COMMUNITIES','Groups'],notifications:['UPDATES','Notifications'],settings:['ACCOUNT','Profile & Settings']};
    $('viewEyebrow').textContent=titles[view]?.[0]||'NEXOCHAT';$('viewTitle').textContent=titles[view]?.[1]||view;
    if(view==='home')renderHome();if(view==='friends')renderFriends();if(view==='chats')renderChats();if(view==='groups')renderGroups();if(view==='notifications')renderNotifications();if(view==='settings')renderSettings();
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.onclick=()=>nav(b.dataset.view));
  $('logoutButton').onclick=async()=>{await sb.auth.signOut();location.reload();};
  $('profileButton').onclick=()=>nav('settings');
  $('mobileSearch').onclick=()=>{nav('chats');setTimeout(()=>document.getElementById('chatSearch')?.focus(),60);};

  async function bootApp(){ await Promise.all([loadFriends(),loadRequests(),loadGroups()]); await loadNotificationCount(); renderHome(); setupNotifications(); }

  async function loadFriends(){
    const {data:fs,error}=await sb.from('friendships').select('user_a,user_b').or(`user_a.eq.${user.id},user_b.eq.${user.id}`);if(error){friends=[];return;}
    const ids=[...new Set((fs||[]).map(x=>x.user_a===user.id?x.user_b:x.user_a))];if(!ids.length){friends=[];return;}const {data:ps}=await sb.from('profiles').select('*').in('id',ids);friends=ps||[];
  }
  async function loadRequests(){
    const [a,b]=await Promise.all([sb.from('friend_requests').select('*').eq('receiver_id',user.id).eq('status','pending').order('created_at',{ascending:false}),sb.from('friend_requests').select('*').eq('sender_id',user.id).eq('status','pending').order('created_at',{ascending:false})]);
    incoming=a.data||[];outgoing=b.data||[];$('friendBadge').textContent=incoming.length;$('friendBadge').hidden=!incoming.length;
  }
  async function searchProfiles(q){if(!q)return[];const {data}=await sb.from('profiles').select('*').or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq('id',user.id).limit(20);return data||[];}
  function relation(p){if(friends.some(x=>x.id===p.id))return 'friend';if(outgoing.some(x=>x.receiver_id===p.id))return 'sent';if(incoming.some(x=>x.sender_id===p.id))return 'received';return 'none';}
  async function sendRequest(id){
    const existing=await sb.from('friend_requests').select('*').or(`and(sender_id.eq.${user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${user.id})`).maybeSingle();
    if(existing.data){if(existing.data.sender_id===user.id && existing.data.status!=='pending'){const {error}=await sb.from('friend_requests').update({status:'pending',updated_at:new Date().toISOString()}).eq('id',existing.data.id);if(error)return toast(error.message);}
      else return toast(existing.data.status==='pending'?'Request already pending.':'You already have a request with this user.');
    }else{const {error}=await sb.from('friend_requests').insert({sender_id:user.id,receiver_id:id});if(error)return toast(error.message);}
    await loadRequests();toast('Friend request sent.');renderFriends();
  }
  async function acceptRequest(id){const {error}=await sb.rpc('accept_friend_request',{p_request_id:id});if(error)return toast(error.message);await loadFriends();await loadRequests();toast('You are now friends.');renderFriends();}
  async function rejectRequest(id){const {error}=await sb.from('friend_requests').update({status:'rejected'}).eq('id',id).eq('receiver_id',user.id);if(error)return toast(error.message);await loadRequests();renderFriends();}

  async function renderHome(){
    const {data:cs}=await sb.from('conversations').select('id,updated_at,conversation_members(user_id)').order('updated_at',{ascending:false}).limit(12);
    const rows=[];
    for(const c of cs||[]){
      const ids=(c.conversation_members||[]).map(x=>x.user_id).filter(x=>x!==user.id);if(!ids[0])continue;
      const p=friends.find(x=>x.id===ids[0]) || (await sb.from('profiles').select('*').eq('id',ids[0]).maybeSingle()).data;
      const {data:m}=await sb.from('messages').select('body,created_at,sender_id').eq('conversation_id',c.id).order('created_at',{ascending:false}).limit(1);
      rows.push({p,m:m?.[0]});
    }
    const items=rows.length?rows.map(r=>`<button class="list-item home-chat-row" data-chat="${r.p?.id||''}">${avatar(r.p)}<div class="grow"><b>${esc(r.p?.full_name||r.p?.username||'Friend')}</b><small>${esc(r.m?.body||'Say hello and start chatting')}</small></div><span class="home-time">${r.m?fmt(r.m.created_at):''}</span></button>`).join(''):friends.length?friends.slice(0,6).map(p=>`<button class="list-item home-chat-row" data-chat="${p.id}">${avatar(p)}<div class="grow"><b>${esc(p.full_name||p.username||'Friend')}</b><small>Online · Start a conversation</small></div></button>`).join(''):empty('No conversations yet','Add a friend and start your first realtime chat.');
    $('view-home').innerHTML=`<div class="home-head"><div class="home-brandline"><div class="brand-mark mini-mark">N</div><b>NexoChat</b></div><button class="icon-btn">⌁</button></div><div class="search home-search"><span>⌕</span><input id="homeSearch" placeholder="Search chats, users, groups..."><button class="home-search-filter">☷</button></div><div class="home-tabs"><button class="active">Chats</button><button data-go="groups">Groups</button><button>All</button></div><div class="section-row home-section"><h3>Recent conversations</h3><button class="text-btn" data-go="chats">See all</button></div><div class="list home-list">${items}</div>`;
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
    document.querySelectorAll('#view-home [data-chat]').forEach(b=>b.onclick=()=>openDirect(b.dataset.chat));
    $('homeSearch').oninput=()=>{const q=$('homeSearch').value.trim().toLowerCase();document.querySelectorAll('.home-chat-row').forEach(r=>r.classList.toggle('hidden',!!q && !r.textContent.toLowerCase().includes(q)));};
    document.querySelectorAll('#view-home .home-tabs button').forEach((b,i)=>b.onclick=()=>{document.querySelectorAll('#view-home .home-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.go)nav(b.dataset.go);});
  }
  async function renderFriends(){
    await Promise.all([loadFriends(),loadRequests()]);
    $('view-friends').innerHTML=`<div class="search"><span>⌕</span><input id="peopleSearch" placeholder="Search people by name or @username"></div><div id="peopleResults"></div><div class="section-row"><h3>Friend requests</h3><span class="pill">${incoming.length}</span></div><div id="incomingList" class="list"></div><div class="section-row"><h3>Your friends</h3><span class="pill">${friends.length}</span></div><div id="friendList" class="list"></div>`;
    const pr=$('peopleResults'); const renderSearch=async()=>{const q=$('peopleSearch').value.trim();if(!q){pr.innerHTML='';return;}const ps=await searchProfiles(q);pr.innerHTML=ps.length?`<div class="section-row"><h3>People</h3></div><div class="list">${ps.map(p=>personRow(p,true)).join('')}</div>`:empty('No people found','Try another name or username.');attachPersonButtons();};
    $('peopleSearch').oninput=()=>{clearTimeout(window.__search);window.__search=setTimeout(renderSearch,250);};
    $('incomingList').innerHTML=incoming.length? (await Promise.all(incoming.map(async r=>{const {data:p}=await sb.from('profiles').select('*').eq('id',r.sender_id).single();return `<div class="list-item">${avatar(p)}<div class="grow"><b>${esc(p?.full_name||p?.username)}</b><small>@${esc(p?.username||'')}</small></div><button class="btn-sm primary-sm" data-accept="${r.id}">Accept</button><button class="btn-sm" data-reject="${r.id}">Decline</button></div>`;}))).join('') : empty('No pending requests','New friend requests will appear here.');
    $('friendList').innerHTML=friends.length?friends.map(p=>personRow(p,false)).join(''):empty('No friends yet','Search for someone above and send a request.');
    document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>acceptRequest(b.dataset.accept));document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>rejectRequest(b.dataset.reject));attachPersonButtons();
  }
  function personRow(p,actions){const rel=relation(p);let action='';if(actions){action=rel==='friend'?`<button class="btn-sm primary-sm" data-chat="${p.id}">Chat</button>`:rel==='sent'?`<span class="pill">Requested</span>`:rel==='received'?`<span class="pill">Check requests</span>`:`<button class="btn-sm primary-sm" data-add="${p.id}">Add friend</button>`;}else action=`<button class="btn-sm primary-sm" data-chat="${p.id}">Chat</button>`;return `<div class="list-item">${avatar(p)}<div class="grow"><b>${esc(p.full_name||p.username||'User')}</b><small>@${esc(p.username||'')} ${p.bio?`· ${esc(p.bio)}`:''}</small></div>${action}</div>`;}
  function attachPersonButtons(){document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>sendRequest(b.dataset.add));document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>openDirect(b.dataset.chat));}

  async function renderChats(){
    const {data:cs}=await sb.from('conversations').select('id,updated_at,conversation_members(user_id)').order('updated_at',{ascending:false});
    const rows=[];for(const c of cs||[]){const ids=(c.conversation_members||[]).map(x=>x.user_id).filter(x=>x!==user.id);if(!ids[0])continue;const p=friends.find(x=>x.id===ids[0]) || (await sb.from('profiles').select('*').eq('id',ids[0]).maybeSingle()).data;const {data:m}=await sb.from('messages').select('body,created_at,sender_id').eq('conversation_id',c.id).order('created_at',{ascending:false}).limit(1);rows.push({c,p,m:m?.[0]});}
    $('view-chats').innerHTML=rows.length?`<div class="search"><span>⌕</span><input id="chatSearch" placeholder="Search chats"></div><div class="list">${rows.map(r=>`<button class="list-item chat-row" data-chat="${r.p?.id}">${avatar(r.p)}<div class="grow"><b>${esc(r.p?.full_name||r.p?.username)}</b><small>${esc(r.m?.body||'Start the conversation')}</small></div><span class="pill">${r.m?fmt(r.m.created_at):''}</span></button>`).join('')}</div>`:empty('No chats yet','Add a friend and start your first realtime conversation.');
    document.querySelectorAll('#view-chats [data-chat]').forEach(b=>b.onclick=()=>openDirect(b.dataset.chat));
  }

  async function openDirect(otherId){
    const p=friends.find(x=>x.id===otherId)||(await sb.from('profiles').select('*').eq('id',otherId).single()).data;if(!p)return toast('User not found.');
    const {data:cid,error}=await sb.rpc('get_or_create_direct_conversation',{p_other_user:otherId});if(error)return toast(error.message);openChat({kind:'direct',id:cid,title:p.full_name||p.username,person:p});
  }
  async function openGroup(groupId){const g=groups.find(x=>x.id===groupId);if(!g)return;openChat({kind:'group',id:groupId,title:g.name,person:{full_name:g.name,avatar_url:null},group:g});}
  function updateContextPanel(c){
    const title=$('.context-profile h2'), subtitle=$('.context-profile>p'), avatarEl=$('.context-profile .avatar.large');
    if(!title||!subtitle||!avatarEl)return;
    const p=c?.person||{};
    title.textContent=p.full_name||p.username||c?.title||'NexoChat';
    subtitle.textContent=c?.kind==='group'?'Group · human chat':'Friend · realtime';
    avatarEl.className='avatar large';
    avatarEl.innerHTML=p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc((p?.full_name||p?.username||'N').slice(0,1).toUpperCase());
    const note=document.querySelector('.context-note p'); if(note)note.textContent='Shared space for real conversations on NexoChat.';
    $('contextMessage').onclick=()=>toast('This conversation is open.');
    $('contextMore').onclick=()=>contextMore(c);
  }
  async function contextMore(c){
    if(!c)return;
    if(c.kind==='direct'){
      const name=c.person?.full_name||c.person?.username||'this user';
      const action=prompt(`More options for ${name}:\n\nType BLOCK to block this user.\nType REPORT to report this user.`);
      if(!action)return;
      const a=action.trim().toLowerCase();
      if(a==='block'){
        const {error}=await sb.from('blocks').insert({blocker_id:user.id,blocked_id:c.person.id});
        if(error)return toast(error.message.includes('duplicate')?'User is already blocked.':error.message);
        toast(`${name} blocked.`); $('closeChat').click();
      }else if(a==='report'){
        const reason=prompt('Report reason (spam, harassment, inappropriate, fake account, other):')||'other';
        const {error}=await sb.from('reports').insert({reporter_id:user.id,target_user_id:c.person.id,reason});
        if(error)return toast(error.message);toast('Report submitted for review.');
      }else toast('Use BLOCK or REPORT.');
    }else if(c.kind==='group'){
      toast('Group options are available from the Groups screen.');
    }
  }

  async function openChat(c){
    currentChat=c; updateContextPanel(c);$('chatTitle').textContent=c.title;$('chatStatus').textContent=c.kind==='group'?'Group · human chat':'Friend · realtime';$('chatAvatar').innerHTML=c.person?.avatar_url?`<img src="${esc(c.person.avatar_url)}" alt="">`:esc((c.person?.full_name||'U').slice(0,1));show($('chatOverlay'),true);await loadChatMessages();
    if(realtime)sb.removeChannel(realtime);
    const table=c.kind==='group'?'group_messages':'messages', filterCol=c.kind==='group'?'group_id':'conversation_id';
    realtime=sb.channel(`nexo-${table}-${c.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:`${filterCol}=eq.${c.id}`},payload=>{if(payload.new.sender_id!==user.id){appendMessage(payload.new,false);markCurrentChatRead();}})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table,filter:`${filterCol}=eq.${c.id}`},payload=>{const el=$('chatMessages').querySelector(`[data-id="${payload.new.id}"]`);if(el)renderMessageElement(el,payload.new);})
      .on('broadcast',{event:'typing'},payload=>{if(payload.payload?.user_id!==user.id){const active=payload.payload?.typing===true;$('typingLine').textContent=active?`${esc(payload.payload?.name||'Someone')} is typing…`:'';$('typingLine').classList.toggle('hidden',!active);if(active){clearTimeout(window.__typingHide);window.__typingHide=setTimeout(()=>$('typingLine').classList.add('hidden'),1800);}}})
      .subscribe();
    await markCurrentChatRead();
  }
  async function loadChatMessages(){const isG=currentChat.kind==='group', table=isG?'group_messages':'messages', col=isG?'group_id':'conversation_id';const {data,error}=await sb.from(table).select('*').eq(col,currentChat.id).order('created_at',{ascending:true});if(error)return toast(error.message);$('chatMessages').innerHTML='';(data||[]).forEach(m=>appendMessage(m,false));scrollChat();}
  function renderMessageElement(d,m){const mine=m.sender_id===user.id;d.className=`msg ${mine?'mine':'theirs'}${m.deleted_at?' deleted':''}`;const status=mine?(m.read_at?' ✓✓':' ✓') : '';d.innerHTML=`${esc(m.deleted_at?'Message deleted':m.body)}<time>${fmt(m.created_at)}${m.edited_at?' · edited':''}${status}</time>`;}
  function appendMessage(m,scroll=true){const d=document.createElement('div');d.dataset.id=m.id||`local-${Date.now()}`;renderMessageElement(d,m);$('chatMessages').appendChild(d);if(scroll)scrollChat();}
  function scrollChat(){$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
  async function markCurrentChatRead(){if(!currentChat)return;const fn=currentChat.kind==='group'?'mark_group_read':'mark_conversation_read';const args=currentChat.kind==='group'?{p_group_id:currentChat.id}:{p_conversation_id:currentChat.id};await sb.rpc(fn,args);}
  $('closeChat').onclick=()=>{show($('chatOverlay'),false);if(realtime)sb.removeChannel(realtime);realtime=null;currentChat=null;$('typingLine').classList.add('hidden');};
  $('chatInput').addEventListener('input',()=>{if(!realtime||!currentChat)return;realtime.send({type:'broadcast',event:'typing',payload:{user_id:user.id,name:profile?.full_name||profile?.username||'Friend',typing:$('chatInput').value.trim().length>0}});});
  $('chatMessages').addEventListener('dblclick',async e=>{const el=e.target.closest('.msg');if(!el||!currentChat)return;const id=el.dataset.id;if(!id)return;const table=currentChat.kind==='group'?'group_messages':'messages';const {data:m}=await sb.from(table).select('*').eq('id',id).maybeSingle();if(!m||m.sender_id!==user.id||m.deleted_at)return;const next=prompt('Edit message:',m.body);if(next===null)return;if(!next.trim())return toast('Message cannot be empty.');const {error}=await sb.from(table).update({body:next.trim(),edited_at:new Date().toISOString()}).eq('id',id).eq('sender_id',user.id);if(error)return toast(error.message);});
  $('chatMore').onclick=async()=>{if(!currentChat)return;const mine=[...$('chatMessages').querySelectorAll('.msg.mine')].pop();if(!mine)return toast('Send a message first.');const id=mine.dataset.id;const table=currentChat.kind==='group'?'group_messages':'messages';const action=prompt('Type EDIT to edit your latest message, or DELETE to remove it.');if(!action)return;const {data:m}=await sb.from(table).select('*').eq('id',id).maybeSingle();if(!m||m.sender_id!==user.id)return toast('Message not found.');if(action.toLowerCase()==='delete'){const {error}=await sb.from(table).update({deleted_at:new Date().toISOString()}).eq('id',id).eq('sender_id',user.id);if(error)return toast(error.message);}else if(action.toLowerCase()==='edit'){const next=prompt('New message:',m.body);if(next?.trim()){const {error}=await sb.from(table).update({body:next.trim(),edited_at:new Date().toISOString()}).eq('id',id).eq('sender_id',user.id);if(error)return toast(error.message);}}};
  $('chatForm').onsubmit=async e=>{e.preventDefault();const body=$('chatInput').value.trim();if(!body||!currentChat)return;const isG=currentChat.kind==='group';const table=isG?'group_messages':'messages', payload=isG?{group_id:currentChat.id,sender_id:user.id,body}:{conversation_id:currentChat.id,sender_id:user.id,body};$('chatInput').value='';if(realtime&&currentChat.kind!=='ai')realtime.send({type:'broadcast',event:'typing',payload:{user_id:user.id,name:profile?.full_name||profile?.username||'Friend',typing:false}});const {data,error}=await sb.from(table).insert(payload).select().single();if(error){$('chatInput').value=body;return toast(error.message);}appendMessage(data);};

  async function loadGroups(){const {data,error}=await sb.from('groups').select('*').order('created_at',{ascending:false});groups=error?[]:data||[];}
  async function renderGroups(){await loadGroups();$('view-groups').innerHTML=`<div class="hero-card"><span class="eyebrow">HUMAN CHAT</span><h2>Groups that stay human.</h2><p class="muted">Group messages stay in the human-only group chat.</p><button id="createGroup" class="primary">＋ Create group</button></div><div class="section-row"><h3>Your groups</h3></div><div id="groupList" class="group-grid"></div>`;const gl=$('groupList');gl.innerHTML=groups.length?groups.map(g=>`<article class="group-card"><span class="pill">GROUP</span><h3>${esc(g.name)}</h3><p class="muted">${esc(g.description||'A NexoChat group')}</p><button class="btn-sm primary-sm" data-open-group="${g.id}">Open chat</button> <button class="btn-sm" data-add-group="${g.id}">Add friend</button></article>`).join(''):empty('No groups yet','Create one and invite your friends.');$('createGroup').onclick=createGroup;document.querySelectorAll('[data-open-group]').forEach(b=>b.onclick=()=>openGroup(b.dataset.openGroup));document.querySelectorAll('[data-add-group]').forEach(b=>b.onclick=()=>addFriendToGroup(b.dataset.addGroup));}
  async function createGroup(){const name=prompt('Group name');if(!name?.trim())return;const description=prompt('Short description (optional)')||'';const {data:g,error}=await sb.from('groups').insert({name:name.trim(),description,owner_id:user.id}).select().single();if(error)return toast(error.message);const {error:me}=await sb.from('group_members').insert({group_id:g.id,user_id:user.id,role:'owner'});if(me)return toast(me.message);toast('Group created.');renderGroups();}
  async function addFriendToGroup(groupId){if(!friends.length)return toast('Add a friend first.');const names=friends.map((f,i)=>`${i+1}. ${f.full_name||f.username}`).join('\n');const answer=prompt(`Choose a friend number to add:\n\n${names}`);const i=Number(answer)-1;const f=friends[i];if(!f)return;if(!confirm(`Add ${f.full_name||f.username} to this group?`))return;const {error}=await sb.from('group_members').insert({group_id:groupId,user_id:f.id,role:'member'});if(error)return toast(error.message);toast('Friend added to group.');}

  async function loadNotificationCount(){const {data}=await sb.from('notifications').select('id').is('read_at',null);const count=data?.length||0;$('notificationBadge').textContent=count;$('notificationBadge').hidden=!count;}
  function setupNotifications(){if(notificationChannel)sb.removeChannel(notificationChannel);notificationChannel=sb.channel(`nexo-notifications-${user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${user.id}`},()=>{loadNotificationCount();if(document.querySelector('#view-notifications:not(.hidden)'))renderNotifications();else toast('You have a new notification.');}).on('postgres_changes',{event:'INSERT',schema:'public',table:'friend_requests',filter:`receiver_id=eq.${user.id}`},async()=>{await loadRequests();renderFriends();}).subscribe();}
  async function renderNotifications(){const {data}=await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50);$('view-notifications').innerHTML=data?.length?`<div class="list">${data.map(n=>`<button class="list-item notification-row" data-notification="${esc(n.id)}"><div class="avatar">${n.type==='friend_accepted'?'✓':'!'}</div><div class="grow"><b>${esc(n.title)}</b><small>${esc(n.body||'')}</small></div><span class="pill">${fmt(n.created_at)}</span></button>`).join('')}</div>`:empty('All quiet','Your notifications will appear here.');document.querySelectorAll('[data-notification]').forEach(b=>b.onclick=async()=>{const n=(data||[]).find(x=>x.id===b.dataset.notification);if(!n)return;if(n.type==='friend_request'){nav('friends');return;}if(n.type==='friend_accepted'&&n.data?.user_id){openDirect(n.data.user_id);return;}toast(n.body||n.title);});if(data?.length){await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);$('notificationBadge').textContent='';$('notificationBadge').hidden=true;}}
  function renderSettings(){ $('view-settings').innerHTML=`<div class="setting"><div><b>Profile</b><small>${esc(profile?.full_name||'')} · @${esc(profile?.username||'')}</small></div><button id="editProfile" class="btn-sm">Edit</button></div><div class="setting"><div><b>Appearance</b><small>Light theme</small></div><span class="pill">LIGHT</span></div><div class="setting"><div><b>Security</b><small>Supabase authentication and row-level security protect your data.</small></div><span class="pill">Protected</span></div><div class="setting"><div><b>Human chat</b><small>Friends and group messages use realtime database chat.</small></div><span class="pill">ON</span></div><div class="setting"><div><b>Account</b><small>${esc(user?.email||'')}</small></div><button id="settingsLogout" class="btn-sm">Log out</button></div>`;$('settingsLogout').onclick=()=>$('logoutButton').click();$('editProfile').onclick=()=>{fillProfile();setPage('profile');};}


  function setupWelcome(){
    if(!welcomePage)return;
    let index=0;
    const slides=[...welcomePage.querySelectorAll('.welcome-slide')], dots=[...welcomePage.querySelectorAll('[data-dot]')];
    const paint=()=>{slides.forEach((s,i)=>s.classList.toggle('active',i===index));dots.forEach((d,i)=>d.classList.toggle('active',i===index));$('welcomeNext').innerHTML=index===slides.length-1?'Get started <span>→</span>':'Next <span>→</span>';};
    $('welcomeNext').onclick=()=>{if(index<slides.length-1){index++;paint();}else{setPage('auth');}};
    $('welcomeSkip').onclick=()=>setPage('auth');
    dots.forEach(d=>d.onclick=()=>{index=Number(d.dataset.dot);paint();});
    paint();
  }
  async function start(){authMode();setupWelcome();const {data}=await sb.auth.getSession();if(data.session)await afterAuth(data.session.user);else setPage('welcome');sb.auth.onAuthStateChange(async (_event,session)=>{if(session?.user && !user)await afterAuth(session.user);});}
  await start();
});
