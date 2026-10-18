(function(){
  "use strict";
  var API="https://wishlist-groups.sites.tab.bot";
  var ME="Nasser";                       // personal list key: wishlist:Nasser (kept from before)
  var K_GROUPS="wishlist:groups", K_NICK="wishlist:nick", K_VIEW="wishlist:view";
  var $=function(id){return document.getElementById(id)};
  var body=document.body, started=false, view="me", items=[], filter="all";
  var groups=[], pending={}, lastSig="", pollTimer=null, loadingGroup=false, lastSync=0;

  function lsGet(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}}
  function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}
  function isGroup(){return view!=="me"}
  function curGroup(){for(var i=0;i<groups.length;i++)if(groups[i].code===view)return groups[i];return null}
  function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
  function toast(t){var e=$("toast");e.textContent=t;e.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(function(){e.classList.add("hidden")},2200)}

  /* ---------- start screen ---------- */
  var joinParam=null;
  try{var q=new URLSearchParams(location.search).get("join");if(q)joinParam=q.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)}catch(_){}
  if(joinParam){var lp=document.querySelector(".login-card p");if(lp)lp.textContent="Press start to open the website and join the group."}
  document.querySelector(".login-btns").addEventListener("click",function(e){
    if(!e.target.closest("button[data-user]"))return;
    start();
  });
  function start(){
    started=true; body.classList.remove("locked");
    groups=lsGet(K_GROUPS,[])||[];
    var v=lsGet(K_VIEW,"me"); if(v!=="me"&&!groups.some(function(g){return g.code===v}))v="me";
    switchTo(v);
    if(joinParam){var c=joinParam;joinParam=null;try{history.replaceState(null,"",location.pathname)}catch(_){};joinGroup(c)}
  }

  /* ---------- api ---------- */
  function api(method,path,data){
    var opt={method:method,headers:{}};
    if(data!==undefined){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(data)}
    return fetch(API+path,opt).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){
        if(!r.ok){var e=new Error(j.error||("Error "+r.status));e.status=r.status;throw e}
        return j;
      });
    });
  }

  /* ---------- storage ---------- */
  function cacheKey(){return isGroup()?"wishlist:group:"+view:"wishlist:"+ME}
  function load(){items=lsGet(cacheKey(),[])||[]; if(!Array.isArray(items))items=[]}
  function save(){
    if(isGroup()){lsSet(cacheKey(),items.filter(function(i){return !i.loading&&!pending[i.id]}))}
    else lsSet(cacheKey(),items);
  }

  /* ---------- tabs / views ---------- */
  function renderTabs(){
    var t=$("tabs"); t.innerHTML="";
    function tab(code,label){
      var b=el("button","tab"+(view===code?" on":""),label); b.type="button"; b.dataset.view=code;
      b.setAttribute("role","tab"); b.setAttribute("aria-selected",view===code?"true":"false"); t.appendChild(b);
    }
    tab("me","★ My list");
    groups.forEach(function(g){tab(g.code,"👥 "+g.name)});
    var on=t.querySelector(".on"); if(on&&on.scrollIntoView)try{on.scrollIntoView({inline:"nearest",block:"nearest"})}catch(_){}
  }
  $("tabs").addEventListener("click",function(e){var b=e.target.closest(".tab");if(b)switchTo(b.dataset.view)});
  function switchTo(v){
    view=v; lsSet(K_VIEW,v); pending={}; lastSig=""; filter="all";
    document.querySelectorAll(".chip").forEach(function(c){c.classList.toggle("on",c.dataset.filter==="all")});
    load(); renderTabs(); renderHead(); render();
    stopPoll();
    if(isGroup()){refreshGroup(true);startPoll()}
    window.scrollTo(0,0);
  }
  function renderHead(){
    var g=curGroup();
    $("invite").classList.toggle("hidden",!g);
    $("refresh").classList.toggle("hidden",!g);
    $("sync").classList.toggle("hidden",!g);
    if(g){
      $("owner").textContent="Group list";
      $("h1").textContent=g.name; $("h1").classList.add("gname");
      $("intro").textContent="Everyone with the code can add, edit and check things off.";
      $("inv-code").textContent=g.code;
      $("foot").textContent="Group list · shared with everyone who has the code";
      $("list-h").textContent="Group wishes";
    } else {
      $("owner").textContent="My list";
      $("h1").innerHTML="Wish<span>list</span>"; $("h1").classList.remove("gname");
      $("intro").textContent="Paste any link. It pops up with the picture, name and price.";
      $("foot").textContent="Wishlist · saved on this phone";
      $("list-h").textContent="Wishes";
    }
    syncText();
  }
  function syncText(){
    if(!isGroup())return;
    var s=$("sync");
    if(loadingGroup&&!lastSync){s.textContent="Loading the group list…";return}
    if(syncErr){s.textContent="Can't reach the group right now. Will keep trying.";s.classList.add("err");return}
    s.classList.remove("err");
    var sec=Math.round((Date.now()-lastSync)/1000);
    s.textContent=lastSync?("Live · updated "+(sec<5?"just now":sec<60?sec+"s ago":Math.round(sec/60)+" min ago")):"";
  }
  var syncErr=false;

  /* ---------- group sync ---------- */
  function refreshGroup(first){
    var code=view; if(code==="me")return Promise.resolve();
    loadingGroup=true; if(first)syncText();
    $("refresh").classList.add("spin");
    return api("GET","/groups/"+code).then(function(g){
      if(view!==code)return;
      syncErr=false; lastSync=Date.now();
      var cg=curGroup(); if(cg&&g.name&&cg.name!==g.name){cg.name=g.name;lsSet(K_GROUPS,groups);renderTabs();renderHead()}
      var server=(g.items||[]);
      var sig=JSON.stringify(server);
      var local=items.filter(function(i){return pending[i.id]});
      if(sig!==lastSig||local.length){
        lastSig=sig;
        items=local.concat(server.filter(function(s){return !pending[s.id]}));
        save(); render();
      }
    }).catch(function(e){
      if(view!==code)return;
      if(e.status===404){syncErr=false;toast("That group doesn't exist anymore");}
      else syncErr=true;
    }).then(function(){loadingGroup=false;$("refresh").classList.remove("spin");syncText()});
  }
  function startPoll(){stopPoll();pollTimer=setInterval(function(){if(!document.hidden&&isGroup()&&!busy())refreshGroup()},6000)}
  function stopPoll(){if(pollTimer)clearInterval(pollTimer);pollTimer=null}
  function busy(){return !$("sheet").classList.contains("hidden")}
  setInterval(syncText,5000);
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&started&&isGroup())refreshGroup()});
  window.addEventListener("focus",function(){if(started&&isGroup())refreshGroup()});
  window.addEventListener("pageshow",function(e){if(e.persisted&&started&&isGroup())refreshGroup()});
  $("refresh").addEventListener("click",function(){refreshGroup()});

  /* ---------- groups sheet ---------- */
  function gsay(t,isErr){var m=$("g-msg");m.textContent=t||"";m.classList.toggle("err",!!isErr)}
  function renderGList(){
    var l=$("g-list"); l.innerHTML="";
    if(!groups.length){return}
    l.appendChild(el("p","g-list-h","Your groups"));
    groups.forEach(function(g){
      var row=el("div","g-row");
      var open=el("button","g-open"); open.type="button"; open.dataset.code=g.code;
      open.appendChild(el("b",null,g.name)); open.appendChild(el("span","g-code",g.code));
      var leave=el("button","g-leave","Leave"); leave.type="button"; leave.dataset.leave=g.code;
      row.appendChild(open); row.appendChild(leave); l.appendChild(row);
    });
  }
  function openG(){gsay("");renderGList();$("gsheet").classList.remove("hidden")}
  function closeG(){$("gsheet").classList.add("hidden")}
  $("groups-btn").addEventListener("click",openG);
  $("g-close").addEventListener("click",closeG);
  $("gsheet").addEventListener("click",function(e){if(e.target===this)closeG()});
  $("g-list").addEventListener("click",function(e){
    var o=e.target.closest("[data-code]"), lv=e.target.closest("[data-leave]");
    if(o){closeG();switchTo(o.dataset.code)}
    else if(lv){
      var c=lv.dataset.leave, g=groups.filter(function(x){return x.code===c})[0];
      if(!confirm("Leave “"+(g?g.name:c)+"”? You can join again with code "+c+"."))return;
      groups=groups.filter(function(x){return x.code!==c}); lsSet(K_GROUPS,groups);
      try{localStorage.removeItem("wishlist:group:"+c)}catch(_){}
      renderGList(); if(view===c)switchTo("me"); else renderTabs();
      gsay("Left the group");
    }
  });
  function addGroup(g){
    if(!groups.some(function(x){return x.code===g.code}))groups.push({code:g.code,name:g.name});
    lsSet(K_GROUPS,groups);
    if(g.items)lsSet("wishlist:group:"+g.code,g.items);
    closeG(); switchTo(g.code); askNick();
  }
  $("createform").addEventListener("submit",function(e){
    e.preventDefault();
    var name=$("g-name").value.trim(); if(!name){gsay("Give your group a name",true);$("g-name").focus();return}
    var btn=this.querySelector("button"); btn.disabled=true; gsay("Making your group…");
    api("POST","/groups",{name:name,by:nick()}).then(function(g){
      $("g-name").value=""; addGroup(g); toast("Group made! Send friends the code "+g.code);
    }).catch(function(err){gsay("Couldn't make the group. Check your internet and try again.",true)})
      .then(function(){btn.disabled=false});
  });
  $("joinform").addEventListener("submit",function(e){
    e.preventDefault();
    var c=$("g-code").value.toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(c.length!==6){gsay("Codes are 6 letters/numbers",true);return}
    joinGroup(c,this.querySelector("button"));
  });
  $("g-code").addEventListener("input",function(){var p=this.selectionStart;this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,"");try{this.setSelectionRange(p,p)}catch(_){}});
  function joinGroup(c,btn){
    if(groups.some(function(x){return x.code===c})){closeG();switchTo(c);toast("You're already in this group");return}
    if(btn)btn.disabled=true; gsay("Joining…");
    api("GET","/groups/"+c).then(function(g){
      $("g-code").value=""; addGroup(g); toast("You joined “"+g.name+"” 🎉");
    }).catch(function(err){
      var m=err.status===404?"No group with code "+c+". Double-check it.":"Couldn't join right now. Check your internet.";
      if($("gsheet").classList.contains("hidden")){openG()} gsay(m,true);
    }).then(function(){if(btn)btn.disabled=false});
  }

  /* ---------- nickname (once, optional, not a login) ---------- */
  function nick(){var n=lsGet(K_NICK,null);return n&&n.name||""}
  function askNick(){
    if(lsGet(K_NICK,null))return;
    setTimeout(function(){$("nick").value="";$("nsheet").classList.remove("hidden");setTimeout(function(){$("nick").focus()},60)},350);
  }
  $("nickform").addEventListener("submit",function(e){e.preventDefault();lsSet(K_NICK,{name:$("nick").value.trim().slice(0,20)});$("nsheet").classList.add("hidden")});
  $("n-skip").addEventListener("click",function(){lsSet(K_NICK,{name:""});$("nsheet").classList.add("hidden")});

  /* ---------- invite code ---------- */
  function shareUrl(c){return location.origin+location.pathname+"?join="+c}
  function copy(t){
    if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t).catch(function(){return fallbackCopy(t)});
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t){var a=document.createElement("textarea");a.value=t;a.setAttribute("readonly","");a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy")}catch(_){}document.body.removeChild(a)}
  $("copy-code").addEventListener("click",function(){var g=curGroup();if(!g)return;copy(g.code).then(function(){toast("Code copied: "+g.code)})});
  $("share-link").addEventListener("click",function(){
    var g=curGroup(); if(!g)return; var u=shareUrl(g.code);
    var text="Join my “"+g.name+"” wishlist! Code: "+g.code;
    if(navigator.share){navigator.share({title:"Wishlist: "+g.name,text:text,url:u}).catch(function(){})}
    else copy(text+" "+u).then(function(){toast("Link copied")});
  });

  /* ---------- helpers ---------- */
  function normUrl(raw){
    raw=(raw||"").trim(); if(!raw)return null;
    var m=raw.match(/https?:\/\/[^\s<>"']+/i)||raw.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i); if(!m)return null; var s=m[0];
    if(!/^https?:\/\//i.test(s)) s="https://"+s;
    try{var u=new URL(s); if(!/\./.test(u.hostname))return null; return u.href}catch(_){return null}
  }
  function domain(u){try{return new URL(u).hostname.replace(/^www\./,"")}catch(_){return u}}
  function favicon(u){return "https://www.google.com/s2/favicons?domain="+encodeURIComponent(domain(u))+"&sz=128"}
  function fmtPrice(p){
    if(p==null||p==="")return "";
    var s=String(p).trim(); if(!s)return "";
    if(/^[\d.,]+$/.test(s)) return "$"+s;
    return s;
  }
  function priceNum(p){var m=String(p||"").replace(/,/g,"").match(/(\d+(?:\.\d+)?)/);return m?parseFloat(m[1]):0}
  function findPrice(d){
    var found=null;
    (function walk(o,depth){
      if(found||!o||typeof o!=="object"||depth>3)return;
      Object.keys(o).forEach(function(k){
        if(found)return; var v=o[k];
        if(/price|amount/i.test(k)&&(typeof v==="string"||typeof v==="number")&&String(v).match(/\d/)) found=v;
        else if(typeof v==="object") walk(v,depth+1);
      });
    })(d,0);
    if(!found){var t=(d.title||"")+" "+(d.description||"");var m=t.match(/[$£€]\s?\d[\d,]*(?:\.\d{2})?/);if(m)found=m[0]}
    if(found&&typeof found==="number")found=String(found);
    if(found&&/^\d/.test(found)&&d.currency==="USD")found="$"+found;
    return found;
  }
  function fetchMeta(url){
    var ctl=("AbortController" in window)?new AbortController():null;
    var timer=setTimeout(function(){if(ctl)ctl.abort()},20000);
    return fetch("https://api.microlink.io/?url="+encodeURIComponent(url),ctl?{signal:ctl.signal}:{})
      .then(function(r){return r.json()})
      .then(function(j){
        clearTimeout(timer);
        if(!j||j.status!=="success"||!j.data)throw new Error("no data");
        var d=j.data;
        return {title:(d.title||"").replace(/\s+/g," ").trim(),image:d.image&&d.image.url||"",logo:d.logo&&d.logo.url||"",site:d.publisher||"",price:findPrice(d)||""};
      })
      .catch(function(){clearTimeout(timer);return null});
  }

  /* ---------- add ---------- */
  var urlIn=$("url"), priceIn=$("price"), msg=$("add-msg");
  function say(t,isErr){msg.textContent=t||"";msg.classList.toggle("err",!!isErr)}
  $("paste").addEventListener("click",function(){
    if(navigator.clipboard&&navigator.clipboard.readText){
      navigator.clipboard.readText().then(function(t){urlIn.value=(t||"").trim();urlIn.focus()}).catch(function(){urlIn.focus();say("Long-press the box and tap Paste")});
    } else {urlIn.focus();say("Long-press the box and tap Paste")}
  });
  $("addform").addEventListener("submit",function(e){
    e.preventDefault(); if(!started)return;
    var url=normUrl(urlIn.value);
    if(!url){say("That doesn't look like a link",true);return}
    var code=view, grp=isGroup();
    var it={id:newId(),url:url,title:"",image:"",logo:"",site:domain(url),price:priceIn.value.trim().slice(0,30),note:"",got:false,added:Date.now(),loading:true};
    if(grp){it.by=nick();pending[it.id]=true}
    items.unshift(it); urlIn.value=""; priceIn.value=""; say("Grabbing the preview…");
    if(filter==="got")setFilter("all"); else render();
    fetchMeta(url).then(function(m){
      if(m){it.title=m.title||domain(url);it.image=m.image||"";it.logo=m.logo||"";it.site=m.site||domain(url);if(!it.price&&m.price)it.price=String(m.price).slice(0,30)}
      else it.title=domain(url);
      it.loading=false;
      if(!grp){
        if(view!=="me")return;
        var cur=items.filter(function(x){return x.id===it.id})[0]; if(!cur)return;
        say(m?"Added ✓":"Added — couldn't get a preview for that one, tap ✎ to name it"); save(); render(); return;
      }
      var payload={id:it.id,url:it.url,title:it.title,image:it.image,logo:it.logo,site:it.site,price:it.price,note:"",got:false,by:it.by};
      if(view===code)render();
      api("POST","/groups/"+code+"/items",payload).then(function(saved){
        delete pending[it.id];
        if(view!==code)return;
        items=items.map(function(x){return x.id===it.id?saved:x});
        save(); render(); say(m?"Added for the whole group ✓":"Added — tap ✎ to name it"); refreshGroup();
      }).catch(function(err){
        delete pending[it.id];
        if(view!==code)return;
        items=items.filter(function(x){return x.id!==it.id}); render();
        say(err.status===409?err.message:"Couldn't add to the group. Check your internet and try again.",true);
      });
    });
    if(!grp)save();
  });

  /* ---------- render ---------- */
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function card(it){
    var li=el("li","card"+(it.got?" done":"")); li.dataset.id=it.id;
    if(it.loading){
      li.classList.add("skel");
      li.appendChild(el("div","thumb"));
      var inf=el("div","info"); inf.appendChild(el("div","site",domain(it.url))); inf.appendChild(el("div","bar")); inf.appendChild(el("div","bar s")); li.appendChild(inf);
      return li;
    }
    var a=el("a","open"); a.href=it.url; a.target="_blank"; a.rel="noopener noreferrer";
    var th=el("div","thumb"), img=el("img");
    img.alt=""; img.loading="lazy"; img.referrerPolicy="no-referrer"; img.decoding="async";
    function useLogo(){th.classList.add("logo"); img.onerror=null; img.src=favicon(it.url)}
    if(it.image){img.src=it.image; img.onerror=function(){ if(it.logo&&img.src!==it.logo){th.classList.add("logo");img.src=it.logo;img.onerror=useLogo} else useLogo() }}
    else if(it.logo){th.classList.add("logo"); img.src=it.logo; img.onerror=useLogo}
    else useLogo();
    th.appendChild(img);
    if(it.price) th.appendChild(el("span","price-tag",fmtPrice(it.price)));
    a.appendChild(th);
    var info=el("div","info"), site=el("div","site"), fi=el("img");
    fi.src=favicon(it.url); fi.alt=""; fi.referrerPolicy="no-referrer"; site.appendChild(fi); site.appendChild(document.createTextNode(it.site||domain(it.url)));
    info.appendChild(site); info.appendChild(el("p","title",it.title||domain(it.url)));
    if(it.note) info.appendChild(el("p","note",it.note));
    if(isGroup()) info.appendChild(el("p","by",it.by?"added by "+it.by:"added by someone"));
    a.appendChild(info); li.appendChild(a);
    var act=el("div","actions");
    var got=el("button","got",it.got?"Got it ✓":"Got it?"); got.type="button"; got.dataset.act="got"; got.setAttribute("aria-pressed",it.got?"true":"false");
    var ed=el("button","edit","✎"); ed.type="button"; ed.dataset.act="edit"; ed.setAttribute("aria-label","Edit");
    var del=el("button","del","✕"); del.type="button"; del.dataset.act="del"; del.setAttribute("aria-label","Delete");
    if(pending[it.id]){got.disabled=ed.disabled=del.disabled=true}
    act.appendChild(got); act.appendChild(ed); act.appendChild(del); li.appendChild(act);
    return li;
  }
  function render(){
    var g=$("grid"); g.innerHTML="";
    var shown=items.filter(function(it){return filter==="all"||(filter==="got"?it.got:!it.got)});
    shown.forEach(function(it){g.appendChild(card(it))});
    $("empty").classList.toggle("hidden",shown.length>0);
    var ep=$("empty").querySelector("p");
    if(!shown.length&&items.length){ep.innerHTML=filter==="got"?"<b>Nothing checked off yet.</b>":"<b>You got everything!</b> 🎉"}
    else if(isGroup()) ep.innerHTML="<b>This group list is empty.</b><br>Paste a link above. Everyone in the group will see it.";
    else ep.innerHTML="<b>Nothing here yet.</b><br>Copy a link from any store and paste it above.";
    var want=items.filter(function(i){return !i.got});
    $("count").textContent=items.length+(items.length===1?" item":" items");
    var tot=want.reduce(function(s,i){return s+priceNum(i.price)},0);
    $("total").textContent="$"+(tot%1?tot.toFixed(2):tot)+" to go";
  }
  function setFilter(f){filter=f;document.querySelectorAll(".chip").forEach(function(c){c.classList.toggle("on",c.dataset.filter===f)});render()}
  document.querySelector(".filters").addEventListener("click",function(e){var c=e.target.closest(".chip");if(c)setFilter(c.dataset.filter)});

  function groupPatch(id,changes){
    var code=view;
    return api("PATCH","/groups/"+code+"/items/"+id,changes).then(function(saved){
      if(view!==code)return; items=items.map(function(x){return x.id===id?saved:x}); save(); render();
    }).catch(function(err){
      if(view!==code)return;
      toast(err.status===404?"Someone deleted that one":"Couldn't save. Check your internet."); refreshGroup();
    });
  }
  var editingId=null;
  $("grid").addEventListener("click",function(e){
    var b=e.target.closest("button[data-act]"); if(!b)return;
    e.preventDefault();
    var id=b.closest(".card").dataset.id, it=items.filter(function(x){return x.id===id})[0]; if(!it)return;
    var act=b.dataset.act;
    if(act==="got"){it.got=!it.got;save();render();if(isGroup())groupPatch(id,{got:it.got})}
    else if(act==="del"){
      items=items.filter(function(x){return x.id!==id});save();render();
      if(isGroup()){var code=view;api("DELETE","/groups/"+code+"/items/"+id).catch(function(){toast("Couldn't delete. Check your internet.");refreshGroup()})}
    }
    else if(act==="edit"){editingId=id;$("e-title").value=it.title||"";$("e-price").value=it.price||"";$("e-note").value=it.note||"";$("sheet").classList.remove("hidden")}
  });
  function closeSheet(){$("sheet").classList.add("hidden");editingId=null}
  $("e-cancel").addEventListener("click",closeSheet);
  $("sheet").addEventListener("click",function(e){if(e.target===this)closeSheet()});
  $("editform").addEventListener("submit",function(e){
    e.preventDefault(); var it=items.filter(function(x){return x.id===editingId})[0]; if(!it){closeSheet();return}
    it.title=$("e-title").value.trim()||it.title; it.price=$("e-price").value.trim(); it.note=$("e-note").value.trim();
    save(); render(); var id=it.id; closeSheet();
    if(isGroup())groupPatch(id,{title:it.title,price:it.price,note:it.note});
  });

  /* ---------- boot ---------- */
  body.classList.add("locked");
  // finish any personal item that was mid-fetch when the page closed
  (function(){var p=lsGet("wishlist:"+ME,[]);if(Array.isArray(p)&&p.some(function(i){return i.loading})){p.forEach(function(i){if(i.loading){i.loading=false;i.title=i.title||domain(i.url)}});lsSet("wishlist:"+ME,p)}})();
})();
