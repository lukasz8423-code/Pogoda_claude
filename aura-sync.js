/* Aura IMGW Component Sync v3 - canonical snapshot + full component diagnostics */
(function(){
  'use strict';

  const IMGW_TTL_MIN = 120;

  function parseLocalTs(raw){
    if(raw==null||raw==='') return null;
    if(raw instanceof Date){const t=raw.getTime();return Number.isFinite(t)?t:null;}
    const s=String(raw).trim();
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(m){
      const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
      const t=d.getTime();
      return Number.isFinite(t)?t:null;
    }
    const t=Date.parse(s);
    return Number.isFinite(t)?t:null;
  }

  function ageMinutes(ts){
    const t=parseLocalTs(ts);
    if(t==null)return null;
    const a=(Date.now()-t)/60000;
    return Number.isFinite(a)?Math.round(a*10)/10:null;
  }

  function fmtTime(ts){
    const t=parseLocalTs(ts);
    return t==null?null:new Date(t).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
  }

  function esc2(x){
    const fn=window.esc;
    if(typeof fn==='function')return fn(x);
    return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function component(value,timestamp,unit,extra){
    const age=ageMinutes(timestamp);
    const fresh=age!=null&&age>=-10&&age<=IMGW_TTL_MIN;
    return Object.assign({
      value:value??null,
      timestamp:timestamp??null,
      time:fmtTime(timestamp),
      ageMinutes:age,
      fresh,
      ttlMinutes:IMGW_TTL_MIN,
      unit:unit||'',
      source:'IMGW Głodowo'
    },extra||{});
  }

  function buildImgwComponents(im){
    if(!im)return null;
    const c={
      temperature:component(im.temperatura,im.temperatura_data,'°C'),
      humidity:component(im.wilgotnosc_wzgledna,im.wilgotnosc_wzgledna_data,'%'),
      wind:component(im.predkosc_wiatru!=null?Number(im.predkosc_wiatru)*3.6:null,im.predkosc_wiatru_data,'km/h',{rawUnit:'m/s'}),
      windDirection:component(im.kierunek_wiatru,im.kierunek_wiatru_data,'°'),
      gust:component(im.poryw_wiatru!=null?Number(im.poryw_wiatru)*3.6:null,im.poryw_wiatru_data,'km/h',{rawUnit:'m/s'}),
      rain10min:component(im.opad_10min,im.opad_10min_data,'mm')
    };
    const fresh=Object.entries(c)
      .filter(([,x])=>x.fresh&&x.timestamp)
      .sort((a,b)=>parseLocalTs(b[1].timestamp)-parseLocalTs(a[1].timestamp));
    const latest=fresh[0];
    return {
      station:im.stacja||im.name||'Głodowo',
      distanceKm:im.dist??null,
      ttlMinutes:IMGW_TTL_MIN,
      components:c,
      latestField:latest?latest[0]:null,
      latestTimestamp:latest?latest[1].timestamp:null,
      latestTime:latest?latest[1].time:null,
      latestAgeMinutes:latest?latest[1].ageMinutes:null
    };
  }

  function sync(){
    try{
      if(!window.S||!S.imgwData)return null;
      const d=buildImgwComponents(S.imgwData);
      if(!d)return null;
      S.imgwData.componentDiagnostics=d;
      S.imgwData.imgwCanonicalSnapshot=d;
      if(d.latestTimestamp){
        const ms=parseLocalTs(d.latestTimestamp);
        S.imgwData.latestObservedAtMs=ms;
        S.imgwData.latestObservedAt=ms;
        S.imgwData.latestObservedLabel=d.latestTime;
        S.imgwData.ageMinutes=d.latestAgeMinutes;
        S.imgwData.observedAt=ms;
      }
      window.__AURA_IMGW_COMPONENT_DIAG=d;
      return d;
    }catch(err){
      console.warn('[AURA IMGW SYNC]',err);
      return null;
    }
  }

  function modelComponentDiagnostics(){
    try{
      const d=S.data||{},c=d.current||{},h=d.hourly||{};
      const ci=typeof currentHourIndex==='function'?currentHourIndex(d,new Date()):0;
      const currentTime=c.time||h.time?.[ci]||null;
      const X=S.X||{};
      const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
      return {
        temperature:component(c.temperature_2m??h.temperature_2m?.[ci]??null,currentTime,'°C',{source:'Open-Meteo current'}),
        feelsLike:component(c.apparent_temperature??h.apparent_temperature?.[ci]??null,currentTime,'°C',{source:'Open-Meteo current'}),
        uv:component(c.uv_index??h.uv_index?.[ci]??null,currentTime,'index',{source:'Open-Meteo current'}),
        cloud:component(c.cloud_cover??h.cloud_cover?.[ci]??null,currentTime,'%',{source:'Aura weather-fusion'}),
        visibility:component(c.visibility??h.visibility?.[ci]??null,currentTime,'m',{source:'Open-Meteo current'}),
        wind:component(c.wind_speed_10m??h.wind_speed_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current'}),
        gust:component(c.wind_gusts_10m??h.wind_gusts_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current'}),
        humidity:component(c.relative_humidity_2m??h.relative_humidity_2m?.[ci]??null,currentTime,'%',{source:'Open-Meteo current'}),
        windDirection:component(c.wind_direction_10m??h.wind_direction_10m?.[ci]??null,currentTime,'°',{source:'Open-Meteo current'}),
        pressure:component(c.pressure_msl??h.pressure_msl?.[ci]??null,currentTime,'hPa',{source:'Open-Meteo current'}),
        radiation:component(c.shortwave_radiation_instant??h.shortwave_radiation_instant?.[ci]??h.shortwave_radiation?.[ci]??null,currentTime,'W/m²',{source:'Open-Meteo current'}),
        dewPoint:component(null,null,'°C',{source:'Aura derived'}),
        apparentFinal:component(num(X.feels),null,'°C',{source:'Aura derived: temperature + RH + wind + gust'}),
        sunShade:component(num(X.sunShade?.sun??null),null,'°C',{source:'Aura derived: solar radiation + wind'}),
        cloudFinal:component(num(X.cloud),null,'%',{source:'Aura weather-fusion final'}),
        cloudConsensus:component(num(S.cloudSource?.consensus),null,'%',{source:'Multi-model diagnostic consensus'}),
        soilMoisture:component(null,null,'m³/m³',{source:'Open-Meteo',reason:'brak pola soil_moisture w aktualnym API pobierania'})
      };
    }catch{return null;}
  }

  function fieldDecision(name,imComp,modelComp,finalValue,source,used,reason){
    const imgwFresh=!!imComp?.fresh;
    const distance=Number(S.imgwData?.dist);
    const within45=Number.isFinite(distance)&&distance<=45;
    const accepted=used===true;
    return {
      name,
      value:finalValue??null,
      source:source||'—',
      used:accepted,
      decision:accepted?'USED':'REJECTED',
      reason:reason|| (accepted?'świeże pole IMGW w zasięgu fuzji':'brak użycia'),
      imgw:imComp?{
        value:imComp.value??null,
        timestamp:imComp.timestamp??null,
        time:imComp.time??null,
        ageMinutes:imComp.ageMinutes??null,
        ttlMinutes:imComp.ttlMinutes??IMGW_TTL_MIN,
        fresh:imgwFresh
      }:null,
      model:modelComp?{
        value:modelComp.value??null,
        timestamp:modelComp.timestamp??null,
        ageMinutes:modelComp.ageMinutes??null,
        source:modelComp.source||null
      }:null,
      final:{value:finalValue??null,source:source||'—'},
      stationDistanceKm:Number.isFinite(distance)?distance:null,
      within45km:within45
    };
  }

  function buildAllComponentDiagnostics(){
    sync();
    const im=S.imgwData||{};
    const ic=window.__AURA_IMGW_COMPONENT_DIAG?.components||{};
    const model=modelComponentDiagnostics()||{};
    const X=S.X||{};
    const finalFusion=S.finalWeatherFusion||{};
    const distance=Number(im.dist);
    const canFuse=Number.isFinite(distance)&&distance<=45;
    const imgwUsable=(k)=>!!ic[k]?.fresh&&canFuse;
    const gustUsable=!!ic.gust?.fresh&&Number.isFinite(distance)&&distance<=30;
    const rainUsable=!!ic.rain10min?.fresh&&Number.isFinite(distance)&&distance<=30;

    const rows=[];
    rows.push(fieldDecision('Temperatura',ic.temperature,model.temperature,X.T,'IMGW → Aura fusion',imgwUsable('temperature'),ic.temperature?.fresh?'świeże IMGW; użyto do fuzji':'timestamp brak/stary lub poza zasięgiem'));
    rows.push(fieldDecision('Wilgotność',ic.humidity,model.humidity,X.hum,'IMGW → Aura fusion',imgwUsable('humidity'),ic.humidity?.fresh?'świeże IMGW; użyto do fuzji':'timestamp brak/stary lub poza zasięgiem'));
    rows.push(fieldDecision('Wiatr',ic.wind,model.wind,X.wind,'IMGW → Aura fusion',imgwUsable('wind'),ic.wind?.fresh?'świeże IMGW; użyto do fuzji':'timestamp brak/stary lub poza zasięgiem'));
    rows.push(fieldDecision('Kierunek wiatru',ic.windDirection,model.windDirection,X.wdeg,'IMGW → Aura fusion',imgwUsable('windDirection'),ic.windDirection?.fresh?'świeże IMGW; użyto do fuzji':'timestamp brak/stary lub poza zasięgiem'));
    rows.push(fieldDecision('Porywy',ic.gust,model.gust,X.gusts,'IMGW → Aura final',gustUsable,'IMGW poryw jest używany niezależnie; TTL 120 min, zasięg 30 km'));
    rows.push(fieldDecision('Opad 10 min',ic.rain10min,null,finalFusion.finalPrecipitation??X.precip,'IMGW → T0 precipitation guard',rainUsable,'świeży opad_10min z Głodowa ma pierwszeństwo dla T0; 0 mm blokuje ghost-rain'));
    rows.push(fieldDecision('Zachmurzenie',null,model.cloud,X.cloud,'weather-fusion',false,'brak bezpośredniego pola IMGW; fuzja modeli/obserwacji nie jest polem stacji'));
    rows.push(fieldDecision('Temperatura odczuwalna',null,model.apparentFinal,X.feels,'Aura derived',false,'wyliczana po fuzji z temperatury, RH, wiatru i porywów'));
    rows.push(fieldDecision('UV',null,model.uv,X.uv,'Open-Meteo',false,'IMGW Głodowo nie dostarcza pola UV w używanym feedzie'));
    rows.push(fieldDecision('Widoczność',null,model.visibility,X.visKm,'Open-Meteo / visibility guard',false,'IMGW Głodowo nie dostarcza używanego pola widoczności; sanityzer dopuszcza niską wartość tylko przy zjawisku redukującym widzialność'));
    rows.push(fieldDecision('Ciśnienie',null,model.pressure,X.press,'Open-Meteo',false,'Głodowo nie dostarcza ciśnienia w tym feedzie'));
    rows.push(fieldDecision('Promieniowanie',null,model.radiation,X.rad,'Open-Meteo',false,'Głodowo nie dostarcza używanego pola promieniowania'));
    rows.push(fieldDecision('Punkt rosy',null,model.dewPoint,X.dewStation??X.dew,'Aura derived / IMGW RH',false,'wyliczany z temperatury i wilgotności; nie jest bezpośrednim pomiarem stacji'));
    rows.push(fieldDecision('Słońce / cień',null,model.sunShade,null,'Aura derived',false,'wynik calcSunShadeTemp(); nie jest pomiarem stacji'));
    rows.push(fieldDecision('Wilgotność liści',null,null,null,'Aura derived',false,'modelowana z punktu rosy, RH, wiatru, chmur i opadu; brak fizycznego czujnika'));
    rows.push(fieldDecision('Gleba 0–1 cm',null,null,null,'brak danych',false,'aktualny endpoint nie pobiera soil_moisture_0_to_1cm; brak wartości nie jest zastępowany'));

    return {
      capturedAt:Date.now(),
      station:window.__AURA_IMGW_COMPONENT_DIAG?.station||im.stacja||'Głodowo',
      distanceKm:Number.isFinite(distance)?distance:null,
      ttlMinutes:IMGW_TTL_MIN,
      canonicalLatestTimestamp:window.__AURA_IMGW_COMPONENT_DIAG?.latestTimestamp||null,
      canonicalLatestTime:window.__AURA_IMGW_COMPONENT_DIAG?.latestTime||null,
      canonicalLatestAgeMinutes:window.__AURA_IMGW_COMPONENT_DIAG?.latestAgeMinutes??null,
      rows
    };
  }

  function heroCanonicalSnapshot(){
    sync();
    const d=window.__AURA_IMGW_COMPONENT_DIAG;
    if(!d)return null;
    return {
      station:d.station,
      distanceKm:d.distanceKm,
      latestField:d.latestField,
      latestTimestamp:d.latestTimestamp,
      latestTime:d.latestTime,
      latestAgeMinutes:d.latestAgeMinutes
    };
  }

  function patchHeroLabel(){
    try{
      const d=heroCanonicalSnapshot();
      if(!d)return;
      const hero=document.querySelector('#s-hero');
      if(!hero)return;
      const chips=hero.querySelectorAll('.chips .chip');
      let chip=null;
      chips.forEach(c=>{
        if(!chip&&/Głodowo|Glodowo/i.test(c.textContent||''))chip=c;
      });
      if(!chip)return;
      const age=d.latestAgeMinutes==null?'wiek nieznany':(Math.max(0,Math.round(d.latestAgeMinutes))<60?Math.max(0,Math.round(d.latestAgeMinutes))+' min temu':fmtAgeSafe(d.latestAgeMinutes));
      chip.innerHTML=(typeof mini==='function'?mini('sat'):'')+esc2(d.station||'Głodowo')+', '+esc2(String(d.distanceKm??'—'))+' km, ostatni świeży pomiar z '+esc2(d.latestTime||'—')+', '+esc2(age);
      chip.classList.remove('warn');
      chip.classList.add('ok');
      chip.title='Kanoniczny snapshot IMGW: '+String(d.latestTimestamp||'—')+' · pole: '+String(d.latestField||'—');
    }catch(err){console.debug('[AURA HERO IMGW]',err);}
  }

  function fmtAgeSafe(min){
    const m=Math.max(0,Math.round(Number(min)||0));
    if(m<60)return m+' min temu';
    const h=Math.floor(m/60),r=m%60;
    return r?h+' h '+r+' min temu':h+' h temu';
  }

  function componentDiagnosticsHTML(){
    const all=buildAllComponentDiagnostics();
    if(!all)return '';
    const rows=all.rows||[];
    const tr=rows.map(r=>{
      const img=r.imgw||{};
      const mod=r.model||{};
      const status=r.decision==='USED'?'✓ UŻYTO':'✕ ODRZUCONO';
      const statusColor=r.decision==='USED'?'var(--ok)':'var(--warn)';
      const imgText=img.value==null?'—':esc2(String(img.value))+(r.name==='Wiatr'||r.name==='Porywy'?' km/h':r.name==='Temperatura'?' °C':r.name==='Wilgotność'?' %':r.name==='Opad 10 min'?' mm':r.name==='Kierunek wiatru'?'°':'');
      const modelText=mod.value==null?'—':esc2(String(mod.value));
      const finalText=r.final?.value==null?'—':esc2(String(r.final.value));
      return `<tr>
        <td><b>${esc2(r.name)}</b></td>
        <td>${imgText}<br><small>${esc2(img.time||'—')} · ${img.ageMinutes==null?'wiek —':img.ageMinutes+' min'} · TTL ${img.ttlMinutes??IMGW_TTL_MIN} min</small></td>
        <td>${modelText}<br><small>${esc2(mod.source||'—')} · ${mod.ageMinutes==null?'wiek —':mod.ageMinutes+' min'}</small></td>
        <td><b>${finalText}</b><br><small>${esc2(r.final?.source||'—')}</small></td>
        <td><b style="color:${statusColor}">${status}</b><br><small>${esc2(r.reason||'—')}</small></td>
      </tr>`;
    }).join('');
    const freshFields=Object.entries(window.__AURA_IMGW_COMPONENT_DIAG?.components||{})
      .filter(([,x])=>x?.fresh).map(([k,x])=>k+' '+x.time+' ('+x.ageMinutes+' min)').join(' · ');
    return `<div class="note" style="margin-top:16px;font-weight:700">🧭 Pełna diagnostyka komponentów — RAW → decyzja → Aura</div>
      <div class="note">Kanoniczny snapshot Głodowa: <b>${esc2(all.canonicalLatestTime||'—')}</b> · ${all.canonicalLatestAgeMinutes==null?'wiek —':esc2(String(all.canonicalLatestAgeMinutes))+' min'} · TTL IMGW <b>${IMGW_TTL_MIN} min</b>.</div>
      <div class="note">Świeże pola IMGW: ${esc2(freshFields||'brak')}.</div>
      <div style="overflow:auto"><table style="width:100%;min-width:980px;border-collapse:collapse;font-size:11px">
        <thead><tr><th>Komponent</th><th>IMGW RAW</th><th>Model / źródło</th><th>Aura final</th><th>Decyzja + powód</th></tr></thead>
        <tbody>${tr}</tbody>
      </table></div>`;
  }

  function patch(){
    sync();

    if(typeof window.render==='function'&&!window.__auraRenderPatched){
      const originalRender=window.render;
      window.render=function(){
        sync();
        const result=originalRender.apply(this,arguments);
        setTimeout(patchHeroLabel,0);
        setTimeout(patchHeroLabel,80);
        return result;
      };
      window.__auraRenderPatched=true;
    }

    if(typeof window.softUpdate==='function'&&!window.__auraSoftPatched){
      const originalSoft=window.softUpdate;
      window.softUpdate=function(){
        sync();
        const result=originalSoft.apply(this,arguments);
        setTimeout(patchHeroLabel,0);
        return result;
      };
      window.__auraSoftPatched=true;
    }

    if(typeof window.pipelineDiagnosticsText==='function'&&!window.__auraDiagTextPatched){
      const originalText=window.pipelineDiagnosticsText;
      window.pipelineDiagnosticsText=function(){
        sync();
        const base=originalText.apply(this,arguments);
        try{
          const obj=JSON.parse(base);
          const d=window.__AURA_IMGW_COMPONENT_DIAG;
          obj.imgw=obj.imgw||{};
          obj.imgw.canonicalLatest=d?.latestTimestamp??null;
          obj.imgw.canonicalLatestTime=d?.latestTime??null;
          obj.imgw.canonicalLatestAgeMinutes=d?.latestAgeMinutes??null;
          obj.imgw.componentDiagnostics=d?.components??null;
          obj.allComponentDiagnostics=buildAllComponentDiagnostics();
          return JSON.stringify(obj,null,2);
        }catch{return base;}
      };
      window.__auraDiagTextPatched=true;
    }

    if(typeof window.openPipelineInspector==='function'&&!window.__auraOpenInspectorPatched){
      const originalOpen=window.openPipelineInspector;
      window.openPipelineInspector=function(){
        sync();
        const result=originalOpen.apply(this,arguments);
        setTimeout(()=>{
          const sheet=document.querySelector('#sheet-root .sheet');
          if(sheet){
            const old=sheet.querySelector('[data-aura-component-diagnostics]');
            if(old)old.remove();
            const wrap=document.createElement('div');
            wrap.dataset.auraComponentDiagnostics='1';
            wrap.innerHTML=componentDiagnosticsHTML();
            sheet.appendChild(wrap);
            patchHeroLabel();
          }
        },0);
        return result;
      };
      window.__auraOpenInspectorPatched=true;
    }

    setTimeout(patchHeroLabel,0);
  }

  patch();
  window.addEventListener('load',patch,{once:true});
  setTimeout(patch,50);
  setTimeout(patch,500);
  setInterval(()=>{
    sync();
    patchHeroLabel();
  },30000);
})();
