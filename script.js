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
  var BLOCKED=/attention required|just a moment|access denied|are you a robot|robot or human|captcha|security check|verify you are human|pardon our interruption|request blocked|forbidden|cloudflare|perimeterx|incapsula|enable javascript|not found|^error|403|404/i;
  var SITE_NAMES={aritzia:"Aritzia",lululemon:"lululemon",shein:"SHEIN",zara:"ZARA",hm:"H&M",asos:"ASOS",nike:"Nike",amazon:"Amazon",adidas:"adidas",uniqlo:"UNIQLO",skims:"SKIMS",urbanoutfitters:"Urban Outfitters",abercrombie:"Abercrombie",hollisterco:"Hollister",ae:"American Eagle",garageclothing:"Garage",brandymelville:"Brandy Melville",pacsun:"PacSun",gap:"Gap",target:"Target",walmart:"Walmart",bestbuy:"Best Buy",sephora:"Sephora",ulta:"Ulta",stockx:"StockX",goat:"GOAT",footlocker:"Foot Locker",jdsports:"JD Sports",apple:"Apple",etsy:"Etsy",temu:"Temu"};
  function siteName(u){
    var h=domain(u).split("."), base=h.length>2&&/^(co|com)$/.test(h[h.length-2])?h[h.length-3]:h[h.length-2]||h[0];
    base=(base||"").toLowerCase();
    return SITE_NAMES[base]||(base.charAt(0).toUpperCase()+base.slice(1));
  }
  // readable name from the link itself, e.g. /product/cozy-sweatfleece-mega-straight™-sweatpant/116292.html
  function slugName(u){
    var segs=[];try{segs=new URL(u).pathname.split("/")}catch(_){return ""}
    var best="",score=0;
    segs.forEach(function(sg){
      var t;try{t=decodeURIComponent(sg)}catch(_){t=sg}
      t=t.replace(/\.(html?|php|aspx?)$/i,"").replace(/[_+]/g,"-");
      var words=t.split("-").filter(function(w){return w&&/[a-z\u00c0-\uffff]/i.test(w)&&!/^\d+$/.test(w)});
      if(words.length<2)return;
      var sc=words.join("").length+words.length*3;
      if(sc>score){score=sc;best=words.join(" ")}
    });
    if(!best)return "";
    best=best.replace(/\b(prod|sku|p|dp|pd|item)\d*\b/gi,"").replace(/\s+/g," ").trim();
    return best.split(" ").map(function(w){return /^(and|or|of|the|with|in|for|a)$/i.test(w)?w.toLowerCase():w.charAt(0).toUpperCase()+w.slice(1)}).join(" ").replace(/^./,function(c){return c.toUpperCase()}).slice(0,120);
  }
  function timed(p,ms){return Promise.race([p,new Promise(function(r){setTimeout(function(){r(null)},ms)})])}
  function microlink(url){
    return timed(fetch("https://api.microlink.io/?url="+encodeURIComponent(url)).then(function(r){return r.json()}).then(function(j){
      if(!j||j.status!=="success"||!j.data)return null;
      var d=j.data, t=(d.title||"").replace(/\s+/g," ").trim();
      var blocked=!t||BLOCKED.test(t)||BLOCKED.test(d.publisher||"");
      return {title:blocked?"":t,image:blocked?"":(d.image&&d.image.url||""),logo:d.logo&&d.logo.url||"",site:blocked?"":(d.publisher||""),price:blocked?"":(findPrice(d)||""),blocked:blocked};
    }).catch(function(){return null}),15000);
  }
  function serverMeta(url){
    return timed(fetch(API+"/meta?url="+encodeURIComponent(url)).then(function(r){return r.json()}).then(function(j){
      if(!j||!j.ok)return null;
      var t=(j.title||"").trim(); if(BLOCKED.test(t))t="";
      return {title:t,image:j.image||"",logo:j.logo||"",site:j.site||"",price:j.price||""};
    }).catch(function(){return null}),12000);
  }
  // returns {title,image,logo,site,price,blocked,named} or null
  function fetchMeta(url){
    return Promise.all([microlink(url),serverMeta(url)]).then(function(r){
      var a=r[0]||{}, b=r[1]||{};
      if(!r[0]&&!r[1]){var sn=slugName(url);return sn?{title:sn,image:"",logo:"",site:siteName(url),price:"",blocked:true,named:true}:null}
      var m={image:a.image||b.image||"",title:a.title||b.title||"",logo:a.logo||b.logo||"",site:a.site||b.site||"",price:b.price||a.price||""};
      m.blocked=!m.image&&(a.blocked||!r[0]);
      if(!m.title){m.title=slugName(url);m.named=!!m.title}
      if(!m.site||BLOCKED.test(m.site))m.site=siteName(url);
      return m;
    });
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
      var nopic=!it.image, picMsg=m&&m.blocked?(it.site||"That site")+" blocks auto pics. Tap 📷 Add pic to add one":"No pic came through. Tap 📷 Add pic to add one";
      it.loading=false;
      if(!grp){
        if(view!=="me")return;
        var cur=items.filter(function(x){return x.id===it.id})[0]; if(!cur)return;
        say(!m?"Added — couldn't get a preview for that one, tap ✎ to name it":nopic?picMsg:"Added ✓"); save(); render(); return;
      }
      var payload={id:it.id,url:it.url,title:it.title,image:it.image,logo:it.logo,site:it.site,price:it.price,note:"",got:false,by:it.by};
      if(view===code)render();
      api("POST","/groups/"+code+"/items",payload).then(function(saved){
        delete pending[it.id];
        if(view!==code)return;
        items=items.map(function(x){return x.id===it.id?saved:x});
        save(); render(); say(!m?"Added — tap ✎ to name it":nopic?picMsg:"Added for the whole group ✓"); refreshGroup();
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
    function noPic(){
      th.innerHTML=""; th.classList.add("nopic");
      var ph=el("span","addpic"); ph.dataset.act="photo"; ph.setAttribute("role","button"); ph.setAttribute("aria-label","Add a picture");
      var fi=el("img"); fi.alt=""; fi.referrerPolicy="no-referrer"; fi.src=favicon(it.url); fi.onerror=function(){fi.remove()};
      ph.appendChild(fi); ph.appendChild(el("b",null,"📷 Add pic"));
      th.appendChild(ph);
      if(it.price) th.appendChild(el("span","price-tag",fmtPrice(it.price)));
    }
    if(it.image){img.src=it.image; img.onerror=noPic; th.appendChild(img)}
    else noPic();
    if(it.price&&it.image) th.appendChild(el("span","price-tag",fmtPrice(it.price)));
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
    var b=e.target.closest("[data-act]"); if(!b||b.disabled)return;
    e.preventDefault();
    var id=b.closest(".card").dataset.id, it=items.filter(function(x){return x.id===id})[0]; if(!it)return;
    var act=b.dataset.act;
    if(act==="got"){it.got=!it.got;save();render();if(isGroup())groupPatch(id,{got:it.got})}
    else if(act==="del"){
      items=items.filter(function(x){return x.id!==id});save();render();
      if(isGroup()){var code=view;api("DELETE","/groups/"+code+"/items/"+id).catch(function(){toast("Couldn't delete. Check your internet.");refreshGroup()})}
    }
    else if(act==="edit"){openEdit(it)}
    else if(act==="photo"){if(pending[id])return;photoFor=id;var qf=$("q-file");qf.value="";qf.click()}
  });
  /* ---------- photos ---------- */
  var photoFor=null, ePhoto=null; // ePhoto: undefined/null = unchanged, {blob,url} = new file, {link} = image link, {remove:true}
  function loadImg(file){
    return new Promise(function(res,rej){
      var u=URL.createObjectURL(file), im=new Image();
      im.onload=function(){res({im:im,done:function(){URL.revokeObjectURL(u)}})};
      im.onerror=function(){URL.revokeObjectURL(u);rej(new Error("That file isn't a photo we can read"))};
      im.src=u;
    });
  }
  // shrink to ~600px JPEG so it's small enough to save + sync
  function shrink(file){
    if(!file||!/^image\//.test(file.type||"image/"))return Promise.reject(new Error("Pick a photo"));
    return loadImg(file).then(function(o){
      var im=o.im, max=640, w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      if(!w||!h){o.done();throw new Error("That photo didn't load")}
      var sc=Math.min(1,max/Math.max(w,h)); w=Math.round(w*sc); h=Math.round(h*sc);
      var c=document.createElement("canvas"); c.width=w; c.height=h;
      var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,w,h); x.drawImage(im,0,0,w,h); o.done();
      var q=0.82, url=c.toDataURL("image/jpeg",q);
      while(url.length>160000&&q>0.4){q-=0.12;url=c.toDataURL("image/jpeg",q)}
      return {url:url,blob:dataBlob(url)};
    });
  }
  function dataBlob(d){var p=d.split(","),bin=atob(p[1]),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:"image/jpeg"})}
  function uploadImg(blob){
    return fetch(API+"/img",{method:"POST",headers:{"Content-Type":"image/jpeg"},body:blob}).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){if(!r.ok||!j.url)throw new Error(j.error||"Upload failed");return j.url});
    });
  }
  function saveStrict(){
    if(isGroup()){save();return true}
    try{localStorage.setItem(cacheKey(),JSON.stringify(items));return true}catch(e){return false}
  }
  // set an item's picture: photo {url,blob} or link string or "" to remove
  function setPhoto(id,photo){
    var it=items.filter(function(x){return x.id===id})[0]; if(!it)return Promise.resolve();
    var before=it.image;
    if(!isGroup()){
      it.image=photo&&photo.url?photo.url:(photo||"");
      if(!saveStrict()){it.image=before;render();toast("Phone storage is full. Remove a few photos and try again.");return Promise.resolve(false)}
      render(); toast(it.image?"Pic added ✓":"Pic removed"); return Promise.resolve(true);
    }
    var code=view; pending[id]=true;
    it.image=photo&&photo.url?photo.url:(photo||""); render();
    var up=photo&&photo.blob?uploadImg(photo.blob):Promise.resolve(it.image);
    return up.then(function(u){
      return api("PATCH","/groups/"+code+"/items/"+id,{image:u}).then(function(saved){
        delete pending[id]; if(view!==code)return;
        items=items.map(function(x){return x.id===id?saved:x}); save(); render(); toast(u?"Pic added for everyone ✓":"Pic removed");
        return true;
      });
    }).catch(function(err){
      delete pending[id]; if(view!==code)return;
      it.image=before; render(); toast(err.status===404?"Someone deleted that one":"Couldn't add the pic. Check your internet."); refreshGroup(); return false;
    });
  }
  $("q-file").addEventListener("change",function(){
    var f=this.files&&this.files[0], id=photoFor; photoFor=null; if(!f||!id)return;
    toast("Adding pic…");
    shrink(f).then(function(p){return setPhoto(id,p)}).catch(function(e){toast(e.message||"Couldn't use that photo")});
  });
  function showPrev(src){
    var p=$("e-prev"); p.innerHTML="";
    if(src){var im=el("img");im.alt="";im.referrerPolicy="no-referrer";im.src=src;im.onerror=function(){p.innerHTML='<span>That link isn\u2019t a picture</span>'};p.appendChild(im);p.classList.remove("empty")}
    else{p.appendChild(el("span",null,"No pic"));p.classList.add("empty")}
    $("e-rm").classList.toggle("hidden",!src);
    $("e-photo-txt").textContent=src?"📷 Change photo":"📷 Add photo";
  }
  function openEdit(it){
    editingId=it.id; ePhoto=null;
    $("e-title").value=it.title||"";$("e-price").value=it.price||"";$("e-note").value=it.note||"";$("e-img").value="";
    $("e-file").value=""; showPrev(it.image||""); $("e-pmsg").textContent="";
    $("sheet").classList.remove("hidden");
  }
  $("e-file").addEventListener("change",function(){
    var f=this.files&&this.files[0]; if(!f)return;
    $("e-pmsg").textContent="Getting photo…";
    shrink(f).then(function(p){ePhoto=p;$("e-img").value="";showPrev(p.url);$("e-pmsg").textContent="Looks good. Tap Save."})
      .catch(function(e){$("e-pmsg").textContent=e.message||"Couldn't use that photo"});
  });
  $("e-img").addEventListener("input",function(){
    var v=this.value.trim();
    if(!v){ePhoto=null;var it=items.filter(function(x){return x.id===editingId})[0];showPrev(it&&it.image||"");return}
    if(/^https?:\/\/\S+$/i.test(v)){ePhoto={link:v.slice(0,600)};showPrev(v);$("e-pmsg").textContent=""}
    else $("e-pmsg").textContent="Paste a link that starts with https://";
  });
  $("e-rm").addEventListener("click",function(){ePhoto={remove:true};$("e-img").value="";showPrev("")});
  function closeSheet(){$("sheet").classList.add("hidden");editingId=null;ePhoto=null}
  $("e-cancel").addEventListener("click",closeSheet);
  $("sheet").addEventListener("click",function(e){if(e.target===this)closeSheet()});
  $("editform").addEventListener("submit",function(e){
    e.preventDefault(); var it=items.filter(function(x){return x.id===editingId})[0]; if(!it){closeSheet();return}
    it.title=$("e-title").value.trim()||it.title; it.price=$("e-price").value.trim(); it.note=$("e-note").value.trim();
    var ph=ePhoto, id=it.id; closeSheet();
    if(isGroup()){
      var p=groupPatch(id,{title:it.title,price:it.price,note:it.note});
      if(ph)p.then(function(){setPhoto(id,ph.remove?"":ph.link?ph.link:ph)});
      render(); return;
    }
    save(); render();
    if(ph)setPhoto(id,ph.remove?"":ph.link?ph.link:ph);
  });

  /* ---------- themes ---------- */
  (function(){
    var THEMES=[["ironman", "Iron Man", "#0d0b0c", "#17131a", "#c8202f", "#ff4757", "#f2b73a", "#f2ece6", "#b9aea6"], ["modern", "Modern", "#0b0b0f", "#141419", "#5b5ff0", "#7c7ffb", "#f4f4f6", "#f4f4f6", "#9b9ba7"], ["midnight", "Midnight Blue", "#070b16", "#0f1628", "#2f6bff", "#5b8cff", "#8fb8ff", "#e8eefc", "#9aa7c4"], ["neon", "Neon", "#07060b", "#110d18", "#ff2e93", "#ff5cb0", "#00e5ff", "#f5f0ff", "#b0a6c8"], ["ocean", "Ocean", "#04141c", "#0a1f2a", "#0891b2", "#22c3e0", "#5eead4", "#e6f6fb", "#93b6c3"], ["forest", "Forest", "#06110b", "#0d1a12", "#15803d", "#22c55e", "#d4b85a", "#eaf6ee", "#9db8a6"], ["galaxy", "Purple Galaxy", "#0b0716", "#150f26", "#7c3aed", "#a06bff", "#f0abfc", "#f1ecff", "#aea3cc"], ["sunset", "Sunset", "#1a0b10", "#22111a", "#e11d48", "#fb5277", "#ff9f43", "#fff1ea", "#d1a9a0"], ["light", "Light", "#f4f6fb", "#ffffff", "#1d4ed8", "#2563eb", "#1d4ed8", "#14161c", "#5b6271"], ["mono", "Black & White", "#0a0a0a", "#151515", "#e5e5e5", "#ffffff", "#ffffff", "#f5f5f5", "#a3a3a3"], ["candy", "Candy", "#fff0f6", "#ffffff", "#db2777", "#ec4899", "#8b5cf6", "#3a0f24", "#8a5570"]];
    var K_THEME="wishlist-theme", grid=$("tgrid"), sheet=$("tsheet");
    function cur(){return document.documentElement.getAttribute("data-theme")||"ironman"}
    function apply(k){
      var t=null;for(var i=0;i<THEMES.length;i++)if(THEMES[i][0]===k)t=THEMES[i];
      if(!t){t=THEMES[0];k=t[0]}
      document.documentElement.setAttribute("data-theme",k);
      var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t[2]);
      try{localStorage.setItem(K_THEME,k)}catch(_){}
      draw();
    }
    function draw(){
      var c=cur();grid.innerHTML="";
      THEMES.forEach(function(t){
        var b=document.createElement("button");b.type="button";b.className="tsw"+(t[0]===c?" on":"");b.dataset.theme=t[0];
        b.setAttribute("aria-pressed",t[0]===c?"true":"false");
        b.innerHTML='<span class="pv" style="background:linear-gradient(160deg,'+t[2]+' 55%,'+t[3]+')"><i class="a" style="background:'+t[4]+'"></i><i class="b" style="background:'+t[8]+';opacity:.55"></i><b style="background:'+t[6]+'"></b></span><span class="nm" style="background:'+t[3]+';color:'+t[7]+'"><span></span><span class="ck">✓</span></span>';
        b.querySelector(".nm span").textContent=t[1];
        grid.appendChild(b);
      });
    }
    grid.addEventListener("click",function(e){var b=e.target.closest(".tsw");if(b)apply(b.dataset.theme)});
    document.addEventListener("click",function(e){if(e.target.closest("[data-open-themes]")){draw();sheet.classList.remove("hidden")}});
    $("t-close").addEventListener("click",function(){sheet.classList.add("hidden")});
    sheet.addEventListener("click",function(e){if(e.target===sheet)sheet.classList.add("hidden")});
    var saved=null;try{saved=localStorage.getItem(K_THEME)}catch(_){}
    if(saved&&saved!==cur())apply(saved);
  })();

  /* ---------- boot ---------- */
  body.classList.add("locked");
  // finish any personal item that was mid-fetch when the page closed
  (function(){var p=lsGet("wishlist:"+ME,[]);if(Array.isArray(p)&&p.some(function(i){return i.loading})){p.forEach(function(i){if(i.loading){i.loading=false;i.title=i.title||domain(i.url)}});lsSet("wishlist:"+ME,p)}})();
})();
