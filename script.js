(function(){
  "use strict";
  var H={"Josh": "c9d1f3632f422c6a1d8b2b15d6e6a2ac15760b7e2d0000056b50877394ed9c0d", "Quadri": "8de331547d4fdc371a289553d32945d01ccc50eae504a74d9f4b42666abb1746", "Nasser": "143169ab59bf1068255cb039956479498b7efa74bb205856b95d886e4587e622"};
  var USER_KEY="wishlist-user";
  var $=function(id){return document.getElementById(id)};
  var body=document.body, user=null, items=[], filter="all";

  function hex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return("0"+b.toString(16)).slice(-2)}).join("")}
  function hashPw(name,pw){return crypto.subtle.digest("SHA-256",new TextEncoder().encode("steamhand:"+name+":"+pw)).then(hex)}

  /* ---------- login ---------- */
  var pick=null, btns=document.querySelector(".login-btns"), pwform=$("pwform"), pw=$("pw"), err=$("pw-err");
  function showPicker(){pick=null;btns.classList.remove("hidden");pwform.classList.add("hidden");err.textContent="";pw.value=""}
  btns.addEventListener("click",function(e){
    var b=e.target.closest("button[data-user]"); if(!b)return;
    pick=b.getAttribute("data-user"); $("pw-name").textContent=pick;
    btns.classList.add("hidden"); pwform.classList.remove("hidden"); err.textContent=""; pw.value=""; setTimeout(function(){pw.focus()},50);
  });
  $("pw-back").addEventListener("click",showPicker);
  pwform.addEventListener("submit",function(e){
    e.preventDefault(); if(!pick)return;
    hashPw(pick,pw.value).then(function(h){
      if(H[pick] && h===H[pick]){login(pick)}
      else{err.textContent="Wrong password";pw.value="";var c=document.querySelector(".login-card");c.classList.remove("shake");void c.offsetWidth;c.classList.add("shake")}
    });
  });
  function login(name){
    user=name; try{localStorage.setItem(USER_KEY,name)}catch(_){}
    body.classList.remove("locked"); showPicker();
    $("who").textContent=name; $("avatar").textContent=name.charAt(0); $("owner").textContent=name+"'s";
    load(); render();
  }
  $("switch").addEventListener("click",function(){
    try{localStorage.removeItem(USER_KEY)}catch(_){}
    user=null; items=[]; $("grid").innerHTML=""; body.classList.add("locked"); showPicker();
  });

  /* ---------- storage ---------- */
  function key(){return "wishlist:"+user}
  function load(){try{items=JSON.parse(localStorage.getItem(key())||"[]")||[]}catch(_){items=[]}}
  function save(){try{localStorage.setItem(key(),JSON.stringify(items))}catch(_){}}

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
  function cleanTitle(t,site){
    t=(t||"").replace(/\s+/g," ").trim();
    return t;
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
        return {
          title:cleanTitle(d.title),
          image:d.image&&d.image.url||"",
          logo:d.logo&&d.logo.url||"",
          site:d.publisher||"",
          desc:d.description||"",
          price:findPrice(d)||""
        };
      })
      .catch(function(e){clearTimeout(timer);return null});
  }

  /* ---------- add ---------- */
  var addform=$("addform"), urlIn=$("url"), priceIn=$("price"), msg=$("add-msg"), addBtn=$("add");
  function say(t,isErr){msg.textContent=t||"";msg.classList.toggle("err",!!isErr)}
  $("paste").addEventListener("click",function(){
    if(navigator.clipboard&&navigator.clipboard.readText){
      navigator.clipboard.readText().then(function(t){urlIn.value=(t||"").trim();urlIn.focus()}).catch(function(){urlIn.focus();say("Long-press the box and tap Paste")});
    } else {urlIn.focus();say("Long-press the box and tap Paste")}
  });
  addform.addEventListener("submit",function(e){
    e.preventDefault(); if(!user)return;
    var url=normUrl(urlIn.value);
    if(!url){say("That doesn't look like a link",true);return}
    var typedPrice=priceIn.value.trim();
    var it={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),url:url,title:"",image:"",logo:"",site:domain(url),price:typedPrice,note:"",got:false,added:Date.now(),loading:true};
    items.unshift(it); urlIn.value=""; priceIn.value=""; say("Grabbing the preview…");
    if(filter==="got"){setFilter("all")}else render();
    var owner=user;
    fetchMeta(url).then(function(m){
      if(owner!==user)return; // switched users mid-fetch
      var cur=items.filter(function(x){return x.id===it.id})[0]; if(!cur)return;
      cur.loading=false;
      if(m){
        cur.title=m.title||domain(url); cur.image=m.image||""; cur.logo=m.logo||"";
        cur.site=m.site||domain(url); if(!cur.price&&m.price)cur.price=m.price;
        say("Added ✓");
      } else {
        cur.title=domain(url); say("Added — couldn't get a preview for that one, tap ✎ to name it");
      }
      save(); render();
    });
    save();
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
    a.appendChild(info); li.appendChild(a);
    var act=el("div","actions");
    var got=el("button","got",it.got?"Got it ✓":"Got it?"); got.type="button"; got.dataset.act="got"; got.setAttribute("aria-pressed",it.got?"true":"false");
    var ed=el("button","edit","✎"); ed.type="button"; ed.dataset.act="edit"; ed.setAttribute("aria-label","Edit");
    var del=el("button","del","✕"); del.type="button"; del.dataset.act="del"; del.setAttribute("aria-label","Delete");
    act.appendChild(got); act.appendChild(ed); act.appendChild(del); li.appendChild(act);
    return li;
  }
  function render(){
    var g=$("grid"); g.innerHTML="";
    var shown=items.filter(function(it){return filter==="all"||(filter==="got"?it.got:!it.got)});
    shown.forEach(function(it){g.appendChild(card(it))});
    $("empty").classList.toggle("hidden",shown.length>0);
    if(!shown.length&&items.length){$("empty").querySelector("p").innerHTML=filter==="got"?"<b>Nothing checked off yet.</b>":"<b>You got everything!</b> 🎉"}
    else $("empty").querySelector("p").innerHTML="<b>Nothing here yet.</b><br>Copy a link from any store and paste it above.";
    var want=items.filter(function(i){return !i.got});
    $("count").textContent=items.length+(items.length===1?" item":" items");
    var tot=want.reduce(function(s,i){return s+priceNum(i.price)},0);
    $("total").textContent="$"+(tot%1?tot.toFixed(2):tot)+" to go";
  }
  function setFilter(f){filter=f;document.querySelectorAll(".chip").forEach(function(c){c.classList.toggle("on",c.dataset.filter===f)});render()}
  document.querySelector(".filters").addEventListener("click",function(e){var c=e.target.closest(".chip");if(c)setFilter(c.dataset.filter)});

  var editing=null;
  $("grid").addEventListener("click",function(e){
    var b=e.target.closest("button[data-act]"); if(!b)return;
    e.preventDefault();
    var id=b.closest(".card").dataset.id, it=items.filter(function(x){return x.id===id})[0]; if(!it)return;
    var act=b.dataset.act;
    if(act==="got"){it.got=!it.got;save();render()}
    else if(act==="del"){items=items.filter(function(x){return x.id!==id});save();render()}
    else if(act==="edit"){editing=it;$("e-title").value=it.title||"";$("e-price").value=it.price||"";$("e-note").value=it.note||"";$("sheet").classList.remove("hidden")}
  });
  $("e-cancel").addEventListener("click",function(){$("sheet").classList.add("hidden");editing=null});
  $("sheet").addEventListener("click",function(e){if(e.target===this){this.classList.add("hidden");editing=null}});
  $("editform").addEventListener("submit",function(e){
    e.preventDefault(); if(!editing)return;
    editing.title=$("e-title").value.trim()||editing.title; editing.price=$("e-price").value.trim(); editing.note=$("e-note").value.trim();
    save(); render(); $("sheet").classList.add("hidden"); editing=null;
  });

  /* ---------- boot ---------- */
  var saved=null; try{saved=localStorage.getItem(USER_KEY)}catch(_){}
  if(saved&&H[saved]) login(saved); else body.classList.add("locked");
  // finish any item that was mid-fetch when the page closed
  if(user){items.forEach(function(it){if(it.loading){it.loading=false;it.title=it.title||domain(it.url)}});save();render()}
})();
