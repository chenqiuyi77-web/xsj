import{u as O,a as B,bP as x,d as E,f as J,d1 as I,d2 as V,aI as W,c as z}from"./index-TZv-6k2e.js";import"./vendor-jszip-2gEiRWaW.js";import"./vendor-howler-vCrZ82dH.js";const L=360*60*1e3;function U(n,e){const s=x().getCharacterSchedule(n,e);if(!s)return!0;const i=Number(s.generatedAt);return!Number.isFinite(i)||i<=0||!Array.isArray(s.slots)||s.slots.length===0?!0:Date.now()-i>L}function _(n){const e=n?.memory;if(!e)return"";const r=[],s=(e.core||[]).filter(t=>t&&t.enabled&&t.content);if(s.length>0){const t=s.filter(c=>c.priority!=="low").map(c=>c.content.trim()).filter(Boolean).slice(0,12);t.length>0&&r.push(t.join("；"))}const i=[],u=(e.longTerm||[]).filter(t=>t&&t.content&&t.status!=="failed").slice(-1),S=(e.shortTerm||[]).filter(t=>t&&t.content&&t.status!=="failed"&&!t.merged).slice(-2);for(const t of[...u,...S]){const c=t.content.trim();c&&i.push(c.slice(0,300))}return i.length>0&&r.push("近期动态："+i.join(`
`)),r.length>0?r.join(`
`):""}function q(n){try{const r=z().getPersonaForContact(n);if(!r)return"";const s=[];return r.name&&s.push(r.name),r.description&&s.push(r.description),s.join("，")}catch{return""}}function G(n){return!Array.isArray(n?.slots)||n.slots.length===0?"":n.slots.map(e=>`- ${e.startTime}-${e.endTime} ${e.activity}${e.location?` @${e.location}`:""}`).join(`
`)}async function Y(n,e,r={}){const s=O(),i=B(),u=x(),S=E(),{scheduleSave:t}=J(),c=r&&r.force===!0,m=r&&r.regenerate===!0;if(!c&&!U(n,e))return u.getCharacterSchedule(n,e);const l=s.contacts?.find(a=>a.id===n);if(!l||l.type==="group")return null;const P=(S.livenessConfig||{}).decisionConfigId||l.configId,h=i.configs?.find(a=>a.id===P)||i.configs?.[0];if(!h?.key||!h?.url)return null;const j=I(l.prompt),$=new Date(e+"T00:00:00"),f=$.toLocaleDateString("zh-CN",{weekday:"long"}),y=$.getDay(),k=y===0||y===6,C=_(l),T=q(n),p=u.getCharacterSchedule(n,e),b=G(p),v=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;let A="";const N=u.getEventsForDate(e).filter(a=>a.shareWithAI);N.length>0&&(A=`
用户当天的安排：
${N.map(g=>{const d=g.startTime||g.dueTime||"";return`- ${d?d+" ":""}${g.title}`}).join(`
`)}
`);let M="";m&&b&&(M=`
上一次已生成过这份日程，请避免只是换个措辞重复它：
${b}
`);const D=k?`今天是${f}，是休息日。想想你周末一般做什么——是在家放松、出去玩、还是有别的安排？`:`今天是${f}，是工作日。想想你这天具体会做什么——上班/上学的节奏、午休怎么过、下班/放学后会干嘛？`,F=`你就是"${l.name}"。今天是${e}，${f}。请具体规划你今天这一天怎么过。

<persona>
${j}
</persona>${C?`

<memory>
${C}
</memory>`:""}${T?`

用户：${T}`:""}${A}${M}
${D}

重要：这是你今天（${e}，${f}）确定的日程，不是通用模板。每个时段写一件确定要做的事，不要写"A或B"这样的选择，也不要写"可能会……"。直接决定你这天要做什么。日程要体现今天是一周中的哪天：工作日和周末不一样，周一和周五的心情也不一样。
如果记忆里和用户有过约定或计划（比如答应一起做某事），把它安排进去。${m?`
这次是重新生成，请在保持设定合理的前提下，给出与上一版明显不同的新安排，不要只改几个词。`:""}

输出 JSON 数组（6-10个时段），interruptible 表示这个时段你是否方便回消息：
[{"startTime":"HH:MM","endTime":"HH:MM","activity":"一件具体的事","location":"具体地点","interruptible":true,"mood":""}]
只输出 JSON。`;try{const{content:a}=await V(h,[{role:"system",content:F},{role:"user",content:m?`请重新生成${l.name}在${e}（${f}）的日程安排。记住今天是${f}，每件事要具体确定，不要用"或"。变体编号：${v}`:`请生成${l.name}在${e}（${f}）的日程安排。记住每件事要具体确定，不要用"或"。`}],{temperature:m?1:.9}),g=a.replace(/```(?:json)?\s*/gi,"").replace(/```\s*/g,"").trim();let d;try{d=JSON.parse(g)}catch{const o=g.match(/\[[\s\S]*\]/);if(o)d=JSON.parse(o[0]);else return console.warn("[CharacterSchedule] Failed to parse response:",g.slice(0,200)),null}if(!Array.isArray(d))return null;const w=d.map(o=>({id:W("slot"),startTime:String(o?.startTime||"").trim(),endTime:String(o?.endTime||"").trim(),activity:String(o?.activity||"").trim(),location:String(o?.location||"").trim(),interruptible:o?.interruptible!==!1,mood:String(o?.mood||"").trim()})).filter(o=>o.startTime&&o.endTime&&o.activity).sort((o,H)=>o.startTime.localeCompare(H.startTime));return w.length===0?null:(u.setCharacterSchedule(n,e,{slots:w,generatedByModel:h.model,generationVersion:m?Math.max(Number(p?.generationVersion)||1,1)+1:Number(p?.generationVersion)||1,regeneratedFrom:m&&Number(p?.generatedAt)||null,regenerationSeed:m?v:""}),t(),u.getCharacterSchedule(n,e))}catch(a){return console.warn("[CharacterSchedule] Generation failed:",a.message),null}}export{Y as generateCharacterSchedule,U as needsScheduleRefresh};
