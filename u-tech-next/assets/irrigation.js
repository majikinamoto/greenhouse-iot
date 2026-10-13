'use strict';
window.NextIrrigation=(()=>{
  const stages=['栄養成長期','花芽分化期','出蕾期','開花結実期','生理落果期','果実肥大期','成熟期'];
  const modes=[['multiply','蒸散量 × A'],['add','蒸散量 ＋ B'],['multiply_add','蒸散量 × A ＋ B'],['add_multiply','（蒸散量 ＋ B）× A']];
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function valid(settings){return settings?.schema_version!==2||(finite(settings.kc)&&settings.kc>=0&&stages.includes(settings.stage)&&settings.trees.length===6&&settings.trees.every(p=>Number.isInteger(p.nozzles)&&p.nozzles>=1&&finite(p.flow*p.nozzles)&&finite(p.a)&&p.a>=0&&finite(p.b)&&modes.some(([key])=>key===p.irrigation_mode)));}
  function apply(tree,settings,index){if(settings?.schema_version!==2)return tree;const p=settings.trees[index],flow=p.flow*p.nozzles,e=tree.daily_litres;let water=null;
    if(tree.complete){water={multiply:()=>e*p.a,add:()=>e+p.b,multiply_add:()=>e*p.a+p.b,add_multiply:()=>(e+p.b)*p.a}[p.irrigation_mode]();water=finite(water)?Math.max(0,water):null;}
    let remaining=water,last=tree.hours.length-1;if(tree.complete&&e>0)tree.hours.forEach((h,i)=>{if(h.litres>0)last=i;});
    for(const [i,h] of tree.hours.entries()){let amount=water===null?null:e>0?water*h.litres/e:water/24;if(amount!==null){if(i===last)amount=Math.max(0,remaining);remaining-=amount;}h.irrigation_litres=amount;h.irrigation_adjustment=amount===null?null:amount-h.litres;h.irrigation_minutes=amount===null?null:amount/flow;}
    return {...tree,irrigation_litres:water,total_flow:flow,daily_minutes:water===null?null:water/flow,cycle_seconds:water===null?null:Math.round(water/flow/settings.cycles*60)};
  }
  return {stages,modes,valid,apply};
})();
