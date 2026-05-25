const c={provider:"deepseek",apiKey:"",baseUrl:"",model:"",enabled:!1},d={deepseek:{baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat",label:"DeepSeek"},doubao:{baseUrl:"https://ark.cn-beijing.volces.com/api/v3",model:"doubao-pro-4k",label:"豆包"}};function p(){try{const s=localStorage.getItem("tbh-ai-config");if(s)return{...c,...JSON.parse(s)}}catch{}return{...c}}function f(s){try{localStorage.setItem("tbh-ai-config",JSON.stringify(s))}catch{}}const u={daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季度"},y={excellent:"优秀",good:"良好",fair:"一般",risk:"风险",critical:"严重"},k={excellent:"text-green-600",good:"text-blue-600",fair:"text-amber-600",risk:"text-orange-600",critical:"text-red-600"},b={excellent:"bg-green-50 border-green-200",good:"bg-blue-50 border-blue-200",fair:"bg-amber-50 border-amber-200",risk:"bg-orange-50 border-orange-200",critical:"bg-red-50 border-red-200"},L={high:"高",medium:"中",low:"低"},S={high:"bg-red-100 text-red-700",medium:"bg-amber-100 text-amber-700",low:"bg-blue-100 text-blue-700"},v={overdue:"逾期",stalled:"停滞",blocked:"阻塞",overloaded:"过载",no_leader:"无负责人",kr_off_track:"KR偏移"};function $(s,a){const t=s.goals,o=s.projects,i=s.tasks;let r=`## 团队概况
`;if(r+=`- 活跃目标: ${t.active}/${t.total}, 完成率: ${t.done}/${t.total}, 平均进度: ${t.avgProgress}%, 逾期: ${t.overdue}, 停滞: ${t.stalled}
`,r+=`- 活跃项目: ${o.active}/${o.total}, 完成率: ${o.done}/${o.total}, 平均进度: ${o.avgProgress}%, 逾期: ${o.overdue}, 停滞: ${o.stalled}
`,r+=`- 任务总量: ${i.total}, 活跃: ${i.active}, 完成: ${i.done}, 逾期: ${i.overdue}, 本期新增: ${i.newInPeriod}, 本期完成: ${i.completedInPeriod}
`,r+=`- 按期完成率: ${i.onTimeRate}%, 平均完成天数: ${i.avgCompletionDays??"N/A"}, 阻塞任务: ${i.blockedByCount}
`,r+=`- 团队健康度: ${a.health.overall}/100 (${a.health.level})

`,a.risks.length>0){r+=`## 风险项 (${a.risks.length})
`;for(const e of a.risks.slice(0,15))r+=`- [${e.severity.toUpperCase()}] ${e.itemType}: ${e.itemTitle} - ${e.description}
`;r+=`
`}r+=`## 逾期目标
`;for(const e of t.items.filter(n=>n.isOverdue)){r+=`- ${e.title} | 负责人: ${e.leaderName} | 进度: ${e.progress}% | 截止: ${e.endDate}
`;for(const n of e.keyResults)r+=`  KR: ${n.title} (${n.current}/${n.target}${n.unit}, ${n.pct}%)
`}r+=`
## 逾期项目
`;for(const e of o.items.filter(n=>n.isOverdue))r+=`- ${e.title} | 负责人: ${e.leaderName} | 进度: ${e.progress}% | 截止: ${e.endDate} | 任务数: ${e.taskCount}
`;r+=`
## 成员负荷
`;for(const e of s.members)r+=`- ${e.name}(${e.role}): 目标${e.activeGoals} 项目${e.activeProjects} 任务${e.activeTasks} | 完成${e.completedTasks} 逾期${e.overdueTasks} 阻塞${e.blockedTasks}
`;return r}function h(s,a){return`你是一个专业的团队管理分析顾问。请基于以下${{daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季度"}[s.period]}业务数据，进行深度分析并输出 JSON 格式的结果。

## 分析要求
请从以下四个维度分析：
1. **目标-项目-任务健康度评估**：整体健康度解读，哪些领域最需要关注
2. **风险预警**：识别当前最紧急的3-5个风险点，按严重程度排序
3. **业务有效性及效率评估**：评估团队整体和个人的工作效率，识别效率瓶颈
4. **业务改进建议**：给出具体可执行的建议，每条建议应关联到具体的成员或事项

## 输出格式
请严格按以下 JSON 格式输出（不要输出其他内容）：
{"insights":[{"id":"1","type":"health|risk|efficiency|improvement","priority":"high|medium|low","title":"简短标题","content":"详细分析内容，1-3句话","actions":["建议操作1","建议操作2"]}]}

请输出5-10条有价值的洞察。

## 当前业务数据
${$(s,a)}`}async function g(s,a){const t=d[a.provider],o=a.baseUrl||t.baseUrl,i=a.model||t.model,r=`${o}/chat/completions`;try{const e=await fetch(r,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a.apiKey}`},body:JSON.stringify({model:i,messages:[{role:"system",content:"你是团队管理分析顾问，输出纯JSON，不含markdown代码块标记。"},{role:"user",content:s}],temperature:.3,max_tokens:3e3})});if(!e.ok){const l=await e.text().catch(()=>"");throw new Error(`LLM API ${e.status}: ${l.slice(0,200)}`)}return(await e.json()).choices?.[0]?.message?.content||null}catch(e){throw e}}function m(s){try{return JSON.parse(s)}catch{}try{const t=s.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();return JSON.parse(t)}catch{}const a=s.match(/\{[\s\S]*"insights"[\s\S]*\}/);if(a)try{return JSON.parse(a[0])}catch{}return null}async function w(s,a){const t=p();if(!t.enabled||!t.apiKey)return[];try{const o=h(s,a),i=await g(o,t);if(!i)return[];const r=m(i);return r?.insights?r.insights.map((e,n)=>({id:`ai_${Date.now()}_${n}`,type:["health","risk","efficiency","improvement"].includes(e.type)?e.type:"improvement",priority:["high","medium","low"].includes(e.priority)?e.priority:"medium",title:e.title||"AI 分析",content:e.content||"",actions:Array.isArray(e.actions)?e.actions:[],createdAt:new Date().toISOString(),fromLLM:!0})):[]}catch{return[]}}function _(s){const a=[],{health:t,efficiency:o,risks:i}=s;t.overall<50?a.push({id:`local_${Date.now()}_1`,type:"health",priority:"high",title:`团队健康度偏低（${t.overall}分）`,content:`目标健康度${t.goals}分，项目${t.projects}分，任务${t.tasks}分，均低于良好水平。建议重点关注${t.goals<=t.projects&&t.goals<=t.tasks?"目标":t.tasks<=t.projects?"任务":"项目"}维度。`,actions:["审查逾期项目并调整优先级","为停滞项目重新分配资源"],createdAt:new Date().toISOString(),fromLLM:!1}):t.overall>=85&&a.push({id:`local_${Date.now()}_1`,type:"health",priority:"low",title:`团队健康度优秀（${t.overall}分）`,content:"各项指标良好，继续保持当前节奏。",actions:[],createdAt:new Date().toISOString(),fromLLM:!1});const r=i.filter(e=>e.severity==="high");return r.length>=3&&a.push({id:`local_${Date.now()}_2`,type:"risk",priority:"high",title:`存在 ${r.length} 个高风险项`,content:`当前有${r.length}个高风险项需要紧急处理。${r.slice(0,3).map(e=>e.description).join("；")}`,actions:r.slice(0,3).map(e=>e.suggestion),createdAt:new Date().toISOString(),fromLLM:!1}),o.overdueTasks>o.activeTasks*.3&&a.push({id:`local_${Date.now()}_3`,type:"efficiency",priority:"high",title:"逾期率偏高",content:`逾期任务 ${o.overdueTasks} 个，占活跃任务的 ${Math.round(o.overdueTasks/Math.max(1,o.activeTasks)*100)}%。建议审查任务排期是否合理。`,actions:["评估任务工作量是否与截止日期匹配","考虑减少并行任务数量"],createdAt:new Date().toISOString(),fromLLM:!1}),o.trend==="up"?a.push({id:`local_${Date.now()}_4`,type:"efficiency",priority:"low",title:"效率趋势良好",content:`本期完成 ${o.completedTasksInPeriod} 个任务，新增 ${o.newTasksInPeriod} 个，完成量 >= 新增量，团队整体节奏健康。`,actions:[],createdAt:new Date().toISOString(),fromLLM:!1}):o.trend==="down"&&a.push({id:`local_${Date.now()}_4`,type:"efficiency",priority:"medium",title:"任务积压风险",content:`本期新增 ${o.newTasksInPeriod} 个任务但仅完成 ${o.completedTasksInPeriod} 个，差距 ${o.newTasksInPeriod-o.completedTasksInPeriod} 个。`,actions:["暂停非紧急新任务创建","聚焦存量任务清零"],createdAt:new Date().toISOString(),fromLLM:!1}),a}export{y as H,u as P,v as R,w as a,k as b,L as c,S as d,b as e,d as f,_ as g,g as h,p as l,f as s};
