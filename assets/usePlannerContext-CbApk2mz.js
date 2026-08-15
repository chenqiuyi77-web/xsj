import{a as y,bG as D,d as S,bP as f,b9 as g,cS as p}from"./index-TZv-6k2e.js";import"./vendor-jszip-2gEiRWaW.js";import"./vendor-howler-vCrZ82dH.js";const w=/日程|待办|计划|安排|要做|任务|备考|考试|复习|deadline|ddl|打卡|准备|学习|工作|生日|纪念日|周年|长期计划|目标/i;function x(t){return!t||typeof t!="string"?!1:w.test(t)}function $(t){const a=f(),n=g(),i=a.getEventsForDate(n).filter(e=>e.shareWithAI),o=a.getUpcomingEvents(3).filter(e=>e.shareWithAI&&e.dueDate>n);if(i.length===0&&o.length===0)return"";const r=[];if(i.length>0){r.push("【今日待办】");for(const e of i){const c=e.startTime||e.dueTime?` ${e.startTime||e.dueTime}`:"",s=e.endTime?`-${e.endTime}`:"",l=e.completed?" ✓":"",d=e.startDate||e.dueDate,h=e.endDate||e.dueDate||d,u=d&&h&&d!==h?` [${d}~${h}]`:"",m=e.kind==="anniversary"?"[纪念日] ":"";r.push(`- ${m}${e.title}${c}${s}${u}${l}`)}}if(o.length>0){r.push("【即将到来】");for(const e of o){const c=e.startDate||e.dueDate,s=e.endDate||e.dueDate||c,l=new Date(c+"T00:00:00"),d=`${l.getMonth()+1}月${l.getDate()}日`,h=e.startTime||e.dueTime?` ${e.startTime||e.dueTime}`:"",u=c!==s?` ~${new Date(s+"T00:00:00").getMonth()+1}月${new Date(s+"T00:00:00").getDate()}日`:"",m=e.kind==="anniversary"?"[纪念日] ":"";r.push(`- ${m}${e.title}（${d}${u}${h}）`)}}return`<schedule_context>
你记得ta最近有这些事（ta聊到相关话题时可以自然提起）：
${r.join(`
`)}
</schedule_context>`}function b(t){if(!t)return"";const n=f().getSharedDiaryForContact(t.id);if(!n||n.length===0)return"";const i=[...n].sort((r,e)=>e.date.localeCompare(r.date)).slice(0,2),o=[];for(const r of i){const e=new Date(r.date+"T00:00:00"),c=`${e.getMonth()+1}月${e.getDate()}日`,s=r.mood?` [${r.mood}]`:"",l=r.content.slice(0,120)+(r.content.length>120?"...":"");o.push(`${c}${s}：${l}`)}return`<diary_exchange>
ta最近和你分享了日记（如果聊到相关话题可以自然提起）：
${o.join(`

`)}
</diary_exchange>`}function P(t){const a=p();for(let n=0;n<t.length;n++)if(t[n].startTime<=a&&a<t[n].endTime)return n;for(let n=0;n<t.length;n++)if(a<t[n].startTime)return n;return t.length-1}function v(t){if(!t)return"";const a=f(),n=g(),i=a.getCharacterSchedule(t.id,n);if(!i?.slots?.length)return"";const o=i.slots,r=P(o),e=p(),c=u=>{let m=`${u.startTime}-${u.endTime} ${u.activity}`;return u.location&&(m+=`（${u.location}）`),m},s=[],l=o[r],d=l&&l.startTime<=e&&e<l.endTime;r>0&&s.push(`刚结束：${c(o[r-1])}`),d&&s.push(`正在：${c(l)}`);const h=d?r+1:r;return h<o.length&&h!==r?s.push(`之后：${c(o[h])}`):!d&&l&&s.push(`即将：${c(l)}`),s.length===0?"":`<character_schedule>
${s.join(`
`)}
</character_schedule>`}function _(t){return!t||t.type==="group"?"":`<planner_capture>
聊天中听到对方提起重要的日子、计划、想做的事，你可以悄悄记下来，自然聊天就好。
比如考试、出行、生日、纪念日、ta的目标、随口提到的”下周要……”，以及你们之间有意义的事。

在回复末尾追加即可（用户看不到）：
<planner_add>
title: 事项标题
date: YYYY-MM-DD
time: HH:mm
type: todo/anniversary
note: 备注
</planner_add>
日期时间不确定可留空。生日纪念日用 type: anniversary。像真正在意ta的人那样，挑重要的记。
</planner_capture>`}function M(t,a){const n=S(),i=!!n.allowPlannerAI,o=!!n.allowAIPlannerCapture;if(!i&&!o)return{layer1:"",layer2:"",layer3:"",action:""};const r=i&&x(a)?$():i?C():"",e=i?b(t):"",c=i?v(t):"",s=o?_(t):"";return{layer1:r,layer2:e,layer3:c,action:s}}function C(t){const a=f(),n=g();return a.getEventsForDate(n).filter(o=>o.shareWithAI&&!o.completed).length===0?"":$()}async function j(t,a){try{const n=y(),i=t.configId,o=n.configs?.find(T=>T.id===i)||n.configs?.[0];if(!o||!o.url||!o.key)return null;const r=new Date(a.date+"T00:00:00"),e=`${r.getMonth()+1}月${r.getDate()}日`,c=a.mood?` [心情：${a.mood}]`:"",s=a.weather?` [天气：${a.weather}]`:"",l=t.prompt||`你是${t.name}，正在以角色身份阅读用户分享的日记并写下你的感想。`,d=`用户在${e}的日记${c}${s}：

${a.content}

请以你的身份（${t.name}）写下读到这篇日记后的感想（2-4句话，自然真诚，不要说"作为AI"）。`,h=o.url.replace(/\/$/,"")+"/chat/completions",u={model:o.model,messages:[{role:"system",content:l},{role:"user",content:d}],temperature:.8,stream:!1};D(u,o.maxTokens);const m=await fetch(h,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${o.key}`},body:JSON.stringify(u)});return m.ok&&(await m.json()).choices?.[0]?.message?.content?.trim()||null}catch{return null}}export{M as buildPlannerPromptLayers,j as generateDiaryReply,x as shouldTriggerPlannerContext};
