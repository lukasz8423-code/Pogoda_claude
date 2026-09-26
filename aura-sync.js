/* Aura IMGW Component Sync v1 - canonical source/timestamp diagnostics */
(function(){
  'use strict';

  function parseLocalTs(raw){
    if(raw==null||raw==='') return null;
    if(raw instanceof Date){ const t=raw.getTime(); return Number.isFinite(t)?t:null; }
    const s=String(raw).trim();
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(m){
      const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
      const t=d.getTime(); return Number.isFinite(t)?t:null;
    }
    const t=Date.parse(s);
    return Number.isFinite(t)?t:null;
  }

  function ageMinutes(ts){
    const t=parseLocalTs(ts);
    if(t==null) return null;
    const a=(Date.now()-t)/60000;
    return Number.isFinite(a)?Math.round(a*10)/10:null;
  }

  function fmtTime(ts){
    const t=parseLocalTs(ts);
    return t==null?null:new Date(t).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  }

  function component(value,timestamp,unit,extra){
    const age=ageMinutes(timestamp);
    const fresh=age!=null&&age>=-10&&age<=120;
    return Object.assign({value:value??null,timestamp:timestamp??null,time:fmtTime(timestamp),ageMinutes:age,fresh,source:'IMGW Głodowo'},extra||{});
  }

  function buildImgwComponents(im){
    if(!im) return null;
    const c={
      temperature:component(im.temperatura,im.temperatura_data,'°C'),
      humidity:component(im.wilgotnosc_wzgledna,im.wilgotnosc_wzgledna_data,'%'),
      wind:component(im.predkosc_wiatru!=null?Number(im.predkosc_wiatru)*3.6:null,im.predkosc_wiatru_data,'km/h',{rawUnit:'m/s'}),
      windDirection:component(im.kierunek_wiatru,im.kierunek_wiatru_data,'°'),
      gust:component(im.poryw_wiatru!=null?Number(im.poryw_wiatru)*3.6:null,im.poryw_wiatru_data,'km/h',{rawUnit:'m/s'}),
      rain10min:component(im.opad_10min,im.opad_10min_data,'mm')
    };
    const fresh=Object.entries(c).filter(([,x])=>x.fresh&&x.timestamp);
    const latest=fresh.sort((a,b)=>parseLocalTs(b[1].timestamp)-parseLocalTs(a[1].timestamp))[0];
    return {station:im.stacja||im.name||'Głodowo',distanceKm:im.dist??null,components:c,latestField:latest?latest[0]:null,latestTimestamp:latest?latest[1].timestamp:null,latestTime:latest?latest[1].time:null,latestAgeMinutes:latest?latest[1].ageMinutes:null};
  }

  function sync(){
    try{
      if(!window.S||!S.imgwData) return null;
      const im=S.imgwData;
      const d=buildImgwComponents(im);
      if(!d) return null;
      im.componentDiagnostics=d;
      if(d.latestTimestamp){
        im.latestObservedAtMs=parseLocalTs(d.latestTimestamp);
        im.latestObservedAt=d.latestObservedAtMs;
        im.latestObservedLabel=d.latestTime;
        im.ageMinutes=d.latestAgeMinutes;
        im.observedAt=d.latestObservedAtMs;
      }
      window.__AURA_IMGW_COMPONENT_DIAG=d;
      return d;
    }catch(err){ console.warn('[AURA IMGW SYNC]',err); return null; }
  }

  function modelComponentDiagnostics(){
    try{
      const d=S.data||{}, c=d.current||{}, h=d.hourly||{}, ci=typeof currentHourIndex==='function'?currentHourIndex(d,new Date()):0;
      const currentTime=c.time||h.time?.[ci]||null;
      const uv=c.uv_index??h.uv_index?.[ci]??null;
      const cloud=c.cloud_cover??h.cloud_cover?.[ci]??null;
      const temp=c.temperature_2m??h.temperature_2m?.[ci]??null;
      const feels=c.apparent_temperature??h.apparent_temperature?.[ci]??null;
      const vis=c.visibility??h.visibility?.[ci]??null;
      return {
        temperature:component(temp,currentTime,'°C',{source:'Open-Meteo current'}),
        feelsLike:component(feels,currentTime,'°C',{source:'Open-Meteo current'}),
        uv:component(uv,currentTime,'index',{source:'Open-Meteo current'}),
        cloud:component(cloud,currentTime,'%',{source:'Aura weather-fusion'}),
        visibility:component(vis,currentTime,'m',{source:'Open-Meteo current'}),
        wind:component(c.wind_speed_10m??h.wind_speed_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current',rawUnit:'km/h'}),
        gust:component(c.wind_gusts_10m??h.wind_gusts_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current'}),
        humidity:component(c.relative_humidity_2m??h.relative_humidity_2m?.[ci]??null,currentTime,'%',{source:'Open-Meteo current'})
      };
    }catch{return null;}
  }

  function componentDiagnosticsHTML(){
    sync();
    const im=window.__AURA_IMGW_COMPONENT_DIAG;
    const model=modelComponentDiagnostics();
    if(!im&&!model) return '';
    const esc2=window.esc||((x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
    const row=(name,x)=>{
      if(!x)return `<tr><td><b>${name}</b></td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
      const age=x.ageMinutes==null?'—':`${x.ageMinutes} min`;
      const status=x.fresh?'✓ FRESH':'✕ STALE';
      return `<tr><td><b>${name}</b></td><td>${x.value==null?'—':esc2(String(x.value))} ${x.unit||''}</td><td>${esc2(x.time||x.timestamp||'—')}</td><td>${age}</td><td><b>${status}</b></td></tr>`;
    };
    return `<div class="note" style="margin-top:16px;font-weight:700">🧭 Kanoniczna diagnostyka komponentów — źródło + timestamp + wiek</div>
      <div class="note">Hero i diagnostyka korzystają z tego samego snapshotu. Najnowszy świeży pomiar Głodowa: <b>${esc2(im?.latestTime||'—')}</b> · ${im?.latestAgeMinutes==null?'wiek —':esc2(String(im.latestAgeMinutes))+' min'}.</div>
      <div style="overflow:auto"><table style="width:100%;min-width:760px;border-collapse:collapse;font-size:11px"><thead><tr><th>Komponent</th><th>Wartość</th><th>Pomiar / snapshot</th><th>Wiek</th><th>Status</th></tr></thead><tbody>
      ${row('IMGW temperatura',im?.components?.temperature)}
      ${row('IMGW wilgotność',im?.components?.humidity)}
      ${row('IMGW wiatr',im?.components?.wind)}
      ${row('IMGW kierunek',im?.components?.windDirection)}
      ${row('IMGW porywy',im?.components?.gust)}
      ${row('IMGW opad 10 min',im?.components?.rain10min)}
      ${row('Model temperatura',model?.temperature)}
      ${row('Model odczuwalna',model?.feelsLike)}
      ${row('Model UV',model?.uv)}
      ${row('Model zachmurzenie',model?.cloud)}
      ${row('Model widoczność',model?.visibility)}
      ${row('Model wiatr',model?.wind)}
      ${row('Model porywy',model?.gust)}
      ${row('Model wilgotność',model?.humidity)}
      </tbody></table></div>`;
  }

  function patch(){
    sync();
    if(typeof window.render==='function'&&!window.__auraRenderPatched){
      const originalRender=window.render;
      window.render=function(){ sync(); return originalRender.apply(this,arguments); };
      window.__auraRenderPatched=true;
    }
    if(typeof window.softUpdate==='function'&&!window.__auraSoftPatched){
      const originalSoft=window.softUpdate;
      window.softUpdate=function(){ sync(); return originalSoft.apply(this,arguments); };
      window.__auraSoftPatched=true;
    }
    if(typeof window.pipelineDiagnosticsText==='function'&&!window.__auraDiagTextPatched){
      const originalText=window.pipelineDiagnosticsText;
      window.pipelineDiagnosticsText=function(){
        sync();
        let base=originalText.apply(this,arguments);
        try{
          const obj=JSON.parse(base);
          const d=window.__AURA_IMGW_COMPONENT_DIAG;
          obj.imgw=obj.imgw||{};
          obj.imgw.canonicalLatest=d?.latestTimestamp??null;
          obj.imgw.canonicalLatestTime=d?.latestTime??null;
          obj.imgw.canonicalLatestAgeMinutes=d?.latestAgeMinutes??null;
          obj.imgw.componentDiagnostics=d?.components??null;
          obj.components=modelComponentDiagnostics();
          return JSON.stringify(obj,null,2);
        }catch{return base;}
      };
      window.__auraDiagTextPatched=true;
    }
    if(typeof window.pipelineInspectorHTML==='function'&&!window.__auraInspectorPatched){
      const originalInspector=window.pipelineInspectorHTML;
      window.pipelineInspectorHTML=function(){
        sync();
        const html=originalInspector.apply(this,arguments);
        return html.replace(/(<div style=\\"display:flex;gap:8px;flex-wrap:wrap;margin-top:12px\\">)/,componentDiagnosticsHTML()+'$1');
      };
      window.__auraInspectorPatched=true;
    }
  }

  patch();
  window.addEventListener('load',patch,{once:true});
  setTimeout(patch,50);
  setTimeout(patch,500);
})();
