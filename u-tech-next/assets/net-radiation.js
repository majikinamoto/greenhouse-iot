'use strict';
window.NextNetPenman=(()=>{
  const version='staff-penman-net-radiation-hourly-v2',vegetativeKc=.4888563516;
  const finite=v=>typeof v==='number'&&Number.isFinite(v),rad=v=>v*Math.PI/180;
  const uses=s=>s?.formula_version===version;
  const valid=s=>uses(s)&&s.kc_formula_version===version&&finite(s.latitude)&&Math.abs(s.latitude)<90&&finite(s.longitude)&&Math.abs(s.longitude)<=180&&finite(s.albedo)&&s.albedo>=0&&s.albedo<=1;
  function ra(time,latitude,longitude){if(!finite(latitude)||Math.abs(latitude)>=90||!finite(longitude)||Math.abs(longitude)>180)return null;const date=new Date(time.replace(' ','T')+'Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19).replace('T',' ')!==time)return null;
    const j=(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(date.getUTCFullYear(),0,1))/86400000+1,phi=rad(latitude),decl=rad(23.45*Math.cos((j-173)*.966*3.1416/180)),distance=1+.01676*Math.cos(rad(.977*(j-186))),ws=Math.acos(Math.max(-1,Math.min(1,-Math.tan(phi)*Math.tan(decl)))),b=2*Math.PI*(j-81)/364,sc=.1645*Math.sin(2*b)-.1255*Math.cos(b)-.025*Math.sin(b),hour=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600,offset=(longitude-135)/15+sc,lo=Math.max(-ws,Math.PI/12*(hour+offset-12)),hi=Math.min(ws,Math.PI/12*(hour+1+offset-12));if(hi<=lo)return 0;
    const value=.00137/distance**2*43200/Math.PI*((hi-lo)*Math.sin(phi)*Math.sin(decl)+Math.cos(phi)*Math.cos(decl)*(Math.sin(hi)-Math.sin(lo)));return finite(value)?Math.max(0,value):null;}
  function hour(time,t,rh,radiation,s){const out={time,ra:null,rs_inside:null,rns:null,rnl:null,rn:null,es:null,ea:null,delta:null,latent:null,relative_radiation:null,cloud_term:null,radiation_et:null,aerodynamic_et:null,raw_et0:null,et0:null};if(!valid(s))return out;out.ra=ra(time,s.latitude,s.longitude);
    if(finite(radiation)&&radiation>=0&&finite(s.transmission_percent)&&s.transmission_percent>=0&&s.transmission_percent<=100){out.rs_inside=radiation*.0036*s.transmission_percent/100;out.rns=(1-s.albedo)*out.rs_inside;}if(out.ra===null||out.rs_inside===null)return out;
    let q=out.ra===0?.5:out.rs_inside/(.75*out.ra);if(out.ra>0&&out.rs_inside/out.ra<=.3)q=Math.max(.3,Math.min(1,q));out.relative_radiation=q;out.cloud_term=1.35*q-.35;
    if(!finite(t)||!finite(rh)||t<=-237.3||rh<0||rh>100||!finite(s.wind_speed)||s.wind_speed<0)return out;
    const es=6.1078*Math.exp(17.2694*t/(t+237.3)),ea=es*rh/100,delta=.4495+.2721e-1*t+.9873e-3*t**2+.2907e-5*t**3+.2538e-6*t**4,latent=2.5-.0024*t;if(!finite(es)||latent<=0||delta+.66<=0)return out;
    const rnl=4.9e-9/24*(t+273.16)**4*(.34-.14*Math.sqrt(ea/10))*out.cloud_term,rn=out.rns-rnl,first=delta/(delta+.66)*rn/latent,second=.66/(delta+.66)*.26*(1+.54*s.wind_speed)*(es-ea)/24,raw=first+second;if(!finite(raw))return out;
    return {...out,rnl,rn,es,ea,delta,latent,radiation_et:first,aerodynamic_et:second,raw_et0:raw,et0:Math.max(0,raw)};}
  function kcBasis(s){if(!uses(s))return null;if(s.stage!=='栄養成長期'||Math.abs(s.kc-vegetativeKc)>1e-12)return {type:'手入力',formula_version:version};return {type:'栄養成長期の校正値',formula_version:version,date:'2026-09-22',latitude:26.110,longitude:127.683,albedo:.20,wind_speed:.1,leaf_area_m2:15,transpiration_litres:21.417319198013953,hourly_et0_sum:2.9207379127399062,kc:vegetativeKc,temperature_humidity_interpolated_hours:[10],transpiration_interpolated_hours:[10,11,14,17,18],transpiration_night_proxy_hours:[0,1,2,3,4,5,21,22,23],note:'1日分の校正。Li-6800 Eはmol/m²/s。正時の値をその時刻から1時間へ適用。気象の補間は検証限定で、本番の欠測補完には使わない。'};}
  return {version,vegetativeKc,uses,valid,ra,hour,kcBasis};
})();
