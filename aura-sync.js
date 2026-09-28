/* Aura IMGW Component Sync v3 - canonical snapshot + full component diagnostics */
(function(){
  'use strict';

  const IMGW_TTL_MIN = 120;
  const S=window.__AURA_STATE__||window.S||null;

  function parseLocalTs(raw){
    if(raw==null||raw==='') return null;
    if(raw instanceof Date){const t=raw.getTime();return Number.isFinite(t)?t:null;}
    if(typeof raw==='number'){const t=raw<1e11?raw*1000:raw;return Number.isFinite(t)?t:null;}
    const text=String(raw).trim();
    if(typeof window.AURA_PARSE_TIMESTAMP==='function'){
      const t=window.AURA_PARSE_TIMESTAMP(text);
      if(Number.isFinite(t))return t;
    }
    // IMGW bez offsetu = czas lokalny Europe/Warsaw. Nigdy nie używamy
    // Date.parse("YYYY-MM-DD HH:mm:ss"), bo silnik JS może potraktować to jako UTC.
    const m=text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(m){
      const y=+m[1],mo=+m[2],d=+m[3],h=+m[4],mi=+m[5],s=+(m[6]||0);
      const naive=Date.UTC(y,mo-1,d,h,mi,s);
      const off=typeof window.AURA_TIMEZONE_OFFSET_MINUTES==='function'
        ? window.AURA_TIMEZONE_OFFSET_MINUTES(naive,'Europe/Warsaw') : 60;
      return naive-(Number.isFinite(off)?off:60)*60000;
    }
    const t=Date.parse(text);
    return Number.isFinite(t)?t:null;
  }

  function ageMinutes(ts){
    const t=parseLocalTs(ts);
    if(t==null)return null;
    const a=(Date.now()-t)/60000;
    return Number.isFinite(a)?Math.round(a*10)/10:null;
  }

  function fmtTime(ts){
    const t=(typeof ts==='number'&&Number.isFinite(ts))?ts:parseLocalTs(ts);
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
    const pick=(...keys)=>{
      for(const key of keys){
        const value=im[key];
        if(value!==undefined&&value!==null&&value!=='') return value;
      }
      return null;
    };
    const c={
      temperature:component(pick('temperatura_powietrza','temperatura'),pick('temperatura_powietrza_data','temperatura_data'),'°C'),
      humidity:component(pick('wilgotnosc_wzgledna'),pick('wilgotnosc_wzgledna_data'),'%'),
      wind:component(pick('wiatr_srednia_predkosc','predkosc_wiatru')!=null?Number(pick('wiatr_srednia_predkosc','predkosc_wiatru'))*3.6:null,pick('wiatr_srednia_predkosc_data','predkosc_wiatru_data'),'km/h',{rawUnit:'m/s'}),
      windDirection:component(pick('wiatr_kierunek','kierunek_wiatru'),pick('wiatr_kierunek_data','kierunek_wiatru_data'),'°'),
      gust:component(pick('wiatr_poryw_10min','poryw_wiatru')!=null?Number(pick('wiatr_poryw_10min','poryw_wiatru'))*3.6:null,pick('wiatr_poryw_10min_data','poryw_wiatru_data'),'km/h',{rawUnit:'m/s'}),
      rain10min:component(pick('opad_10min'),pick('opad_10min_data'),'mm')
    };
    const latest=Object.entries(c).filter(([,x])=>x.timestamp).sort((a,b)=>parseLocalTs(b[1].timestamp)-parseLocalTs(a[1].timestamp))[0];
    const freshFields=Object.entries(c).filter(([,x])=>x.fresh&&x.timestamp).map(([key,x])=>({key,...x}));
    return {
      station:im.stacja||im.name||'Głodowo',
      distanceKm:im.dist??null,
      ttlMinutes:IMGW_TTL_MIN,
      components:c,
      latestField:latest?latest[0]:null,
      latestTimestamp:latest?latest[1].timestamp:null,
      latestTime:latest?latest[1].time:null,
      latestAgeMinutes:latest?latest[1].ageMinutes:null,
      freshFields
    };
  }

  function sync(){
    try{
      if(typeof S==='undefined'||!S)return null;
      const diag=window.__AURA_IMGW_DIAG||{};
      const source=S?.imgwData||S?.imgwDiag?.normalized||diag.normalized||null;
      if(!source)return null;
      if(!S.imgwData)S.imgwData=source;
      const d=buildImgwComponents(source);
      if(!d)return null;
      if(S){S.imgwData.componentDiagnostics=d;S.imgwData.imgwCanonicalSnapshot=d;}
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
    }catch(err){console.warn('[AURA IMGW SYNC]',err);return null;}
  }

  window.AURA_SYNC_IMGW=function(){return sync();};
  let syncAttempts=0;
  const syncTimer=setInterval(()=>{syncAttempts++;if(sync()||syncAttempts>=30)clearInterval(syncTimer);},500);

  function geminiAuraContext(){
    try{
      const d=S.data||{},c=d.current||{},h=d.hourly||{};
      const ci=typeof currentHourIndex==='function'?currentHourIndex(d,new Date()):0;
      const num=v=>Number.isFinite(Number(v))?Number(v):null;
      const time=c.time||h.time?.[ci]||null;
      const cloudFinal=num(S.X?.cloud),tempFinal=num(S.X?.T),feelsFinal=num(S.X?.feels),windFinal=num(S.X?.wind),gustFinal=num(S.X?.gusts),uvFinal=num(S.X?.uv);
      const weatherFinal=S.X?.wm?.t||S.X?.weatherText||null;
      return {capturedAt:new Date().toISOString(),time,auraFinal:{temperatureC:tempFinal,feelsLikeC:feelsFinal,cloudCoverPercent:cloudFinal,cloudSource:'Aura X.cloud (Hero)',windKmh:windFinal,gustKmh:gustFinal,uv:uvFinal,weather:weatherFinal,imgw:{station:S.imgwData?.stacja||S.imgwData?.name||null,latestTimestamp:S.imgwData?.observedAt||S.imgwData?.latestObservedAt||null,ageMinutes:S.imgwData?.ageMinutes??null}}};
    }catch{return null;}
  }

  function modelComponentDiagnostics(){
    try{
      const d=S.data||{},c=d.current||{},h=d.hourly||{},ci=typeof currentHourIndex==='function'?currentHourIndex(d,new Date()):0,currentTime=c.time||h.time?.[ci]||null,X=S.X||{},num=v=>Number.isFinite(Number(v))?Number(v):null;
      return {
        temperature:component(c.temperature_2m??h.temperature_2m?.[ci]??null,currentTime,'°C',{source:'Open-Meteo current'}),
        feelsLike:component(c.apparent_temperature??h.apparent_temperature?.[ci]??null,currentTime,'°C',{source:'Open-Meteo current'}),
        uv:component(c.uv_index??h.uv_index?.[ci]??null,currentTime,'index',{source:'Open-Meteo current'}),
        cloud:component(
          Number.isFinite(Number(S.cloudSource?.fusion?.satelliteCloud))
            ?Number(S.cloudSource.fusion.satelliteCloud)
            :(c.cloud_cover??h.cloud_cover?.[ci]??null),
          Number.isFinite(Number(S.cloudSource?.fusion?.satelliteCloud))
            ?(S.cloudSource.fusion.satelliteObservationTime||null)
            :currentTime,
          '%',
          Number.isFinite(Number(S.cloudSource?.fusion?.satelliteCloud))
            ?{
              source:'EUMETSAT CLM → Aura',
              sourceType:'REMOTE_OBSERVATION',
              observationAt:S.cloudSource.fusion.satelliteObservationTime||null,
              ageBasis:'observation_time',
              satelliteUsed:true,
              modelValue:Number.isFinite(Number(c.cloud_cover??h.cloud_cover?.[ci]))?Number(c.cloud_cover??h.cloud_cover?.[ci]):null
            }
            :{source:'Aura weather-fusion',sourceType:'MODEL_FUSION'}
        ),
        visibility:component(c.visibility??h.visibility?.[ci]??null,currentTime,'m',{source:'Open-Meteo current'}),
        wind:component(c.wind_speed_10m??h.wind_speed_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current'}),
        gust:component(c.wind_gusts_10m??h.wind_gusts_10m?.[ci]??null,currentTime,'km/h',{source:'Open-Meteo current'}),
        humidity:component(c.relative_humidity_2m??h.relative_humidity_2m?.[ci]??null,currentTime,'%',{source:'Open-Meteo current'}),
        windDirection:component(c.wind_direction_10m??h.wind_direction_10m?.[ci]??null,currentTime,'°',{source:'Open-Meteo current'}),
        pressure:component(c.pressure_msl??h.pressure_msl?.[ci]??null,currentTime,'hPa',{source:'Open-Meteo current'}),
        radiation:component(c.shortwave_radiation_instant??h.shortwave_radiation?.[ci]??null,currentTime,'W/m²',{source:'Open-Meteo current'}),
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
    const imgwFresh=!!imComp?.fresh,distance=Number(S.imgwData?.dist),within45=Number.isFinite(distance)&&distance<=45,accepted=used===true,hasFinal=finalValue!==null&&finalValue!==undefined&&finalValue!=='',hasModel=!!modelComp&&modelComp.value!==null&&modelComp.value!==undefined&&modelComp.value!=='',sourceText=String(source||'').toLowerCase();
    let decision='REJECTED',decisionLabel='✕ ODRZUCONO',decisionColor='var(--warn)';
    if(accepted){decision='USED';decisionLabel='✓ UŻYTO IMGW';decisionColor='var(--ok)';}
    else if(hasFinal&&(sourceText.includes('aura derived')||sourceText.includes('derived'))){decision='DERIVED';decisionLabel='◌ WYLICZONO';decisionColor='var(--ink2)';}
    else if(hasModel&&hasFinal){decision='MODEL_ONLY';decisionLabel='◉ MODEL';decisionColor='var(--rain)';}
    else if(hasFinal&&(sourceText.includes('guard')||sourceText.includes('precipitation guard'))){decision='SYSTEM';decisionLabel='→ GUARD';decisionColor='var(--ink2)';}
    else if(hasFinal&&sourceText!=='brak danych'){decision='SOURCE_ONLY';decisionLabel='→ ŹRÓDŁO';decisionColor='var(--ink2)';}
    else if(hasFinal){decision='VALUE';decisionLabel='✓ WARTOŚĆ';decisionColor='var(--ok)';}
    else{decision='NO_DATA';decisionLabel='— BRAK DANYCH';decisionColor='var(--ink3)';}
    let finalReason=reason||'';
    if(decision==='MODEL_ONLY')finalReason='IMGW nie zostało użyte; wartość końcowa pochodzi z modelu.';
    if(decision==='MODEL_ONLY'&&!accepted&&/^świeże IMGW; użyto do fuzji$/i.test(finalReason))finalReason='IMGW nie zostało użyte dla tego komponentu; wartość końcowa pochodzi z modelu.';
    if(decision==='USED'&&!finalReason)finalReason='świeże IMGW w zasięgu fuzji; użyto.';
    if(decision==='NO_DATA'&&!finalReason)finalReason='brak wartości końcowej.';
    return {name,value:finalValue??null,source:source||'—',used:accepted,decision,decisionLabel,decisionColor,reason:finalReason,imgw:imComp?{value:imComp.value??null,timestamp:imComp.timestamp??null,time:imComp.time??null,ageMinutes:imComp.ageMinutes??null,ttlMinutes:imComp.ttlMinutes??IMGW_TTL_MIN,fresh:imgwFresh}:null,model:modelComp?{value:modelComp.value??null,timestamp:modelComp.timestamp??null,ageMinutes:modelComp.ageMinutes??null,source:modelComp.source||null}:null,final:{value:finalValue??null,source:source||'—'},stationDistanceKm:Number.isFinite(distance)?distance:null,within45km:within45};
  }

  function buildAllComponentDiagnostics(){
    sync();
    const state=window.__AURA_STATE__||S||{},diag=window.__AURA_IMGW_DIAG||state.imgwDiag||{},im=state.imgwData||diag.normalized||{},ic=window.__AURA_IMGW_COMPONENT_DIAG?.components||{},model=modelComponentDiagnostics()||{},X=state.X||{},finalFusion=state.finalWeatherFusion||{},distance=Number(im.dist),canFuse=Number.isFinite(distance)&&distance<=45;
    const imgwUsable=k=>!!ic[k]?.fresh&&canFuse,gustUsable=!!ic.gust?.fresh&&Number.isFinite(distance)&&distance<=30,rainUsable=!!ic.rain10min?.fresh&&Number.isFinite(distance)&&distance<=30;
    const canonicalEntries=Object.entries(ic).filter(([,x])=>x?.timestamp).sort((a,b)=>parseLocalTs(b[1].timestamp)-parseLocalTs(a[1].timestamp)),canonicalLatest=canonicalEntries[0]?.[1]||null;
    const rows=[];
    const tSource=imgwUsable('temperature')?'IMGW → Aura fusion':'Open-Meteo → Aura fallback',hSource=imgwUsable('humidity')?'IMGW → Aura fusion':'Open-Meteo → Aura fallback',wSource=imgwUsable('wind')?'IMGW → Aura fusion':'Open-Meteo → Aura fallback',wdSource=imgwUsable('windDirection')?'IMGW → Aura fusion':'Open-Meteo → Aura fallback',gSource=gustUsable?'IMGW → Aura final':'Open-Meteo → Aura fallback',pSource=rainUsable?'IMGW → T0 precipitation guard':'Guard → brak świeżego IMGW';
    rows.push(fieldDecision('Temperatura',ic.temperature,model.temperature,X.T,tSource,imgwUsable('temperature'),ic.temperature?.fresh?'świeże IMGW; użyto do fuzji':'IMGW poza TTL/zasięgiem; użyto modelu'));
    rows.push(fieldDecision('Wilgotność',ic.humidity,model.humidity,X.hum,hSource,imgwUsable('humidity'),ic.humidity?.fresh?'świeże IMGW; użyto do fuzji':'IMGW poza TTL/zasięgiem; użyto modelu'));
    rows.push(fieldDecision('Wiatr',ic.wind,model.wind,X.wind,wSource,imgwUsable('wind'),ic.wind?.fresh?'świeże IMGW; użyto do fuzji':'IMGW poza TTL/zasięgiem; użyto modelu'));
    rows.push(fieldDecision('Kierunek wiatru',ic.windDirection,model.windDirection,X.wdeg,wdSource,imgwUsable('windDirection'),ic.windDirection?.fresh?'świeże IMGW; użyto do fuzji':'IMGW poza TTL/zasięgiem; użyto modelu'));
    rows.push(fieldDecision('Porywy',ic.gust,model.gust,X.gusts,gSource,gustUsable,gustUsable?'IMGW poryw jest używany niezależnie; TTL 120 min, zasięg 30 km':'IMGW poza TTL/zasięgiem; zachowano model dla T0.'));
    rows.push(fieldDecision('Opad 10 min',ic.rain10min,null,finalFusion.finalPrecipitation??X.precip,pSource,rainUsable,rainUsable?'świeży opad_10min z Głodowa ma pierwszeństwo dla T0; 0 mm blokuje ghost-rain':'Brak świeżego opadu_10min z Głodowa; guard nie może użyć IMGW.'));
    const satCloudDiag=Number.isFinite(Number(model.cloud?.value))&&model.cloud?.satelliteUsed===true;
    const cloudFinalSource=satCloudDiag?'EUMETSAT CLM → Aura':'Open-Meteo → weather-fusion';
    const cloudReason=satCloudDiag
      ?'bezpośrednia obserwacja satelitarna CLM została użyta w fuzji; wiek liczony od czasu obserwacji'
      :'brak użytecznej obserwacji satelitarnej; wartość pochodzi z fuzji modeli';
    rows.push(fieldDecision('Zachmurzenie',null,model.cloud,X.cloud,cloudFinalSource,false,cloudReason));
    rows.push(fieldDecision('Temperatura odczuwalna',null,model.apparentFinal,X.feels,'Aura derived',false,'wyliczana po fuzji z temperatury, RH, wiatru i porywów'));
    rows.push(fieldDecision('UV',null,model.uv,X.uv,'Open-Meteo',false,'IMGW Głodowo nie dostarcza pola UV w używanym feedzie'));
    rows.push(fieldDecision('Widoczność',null,model.visibility,X.visKm,'Open-Meteo → visibility guard',false,'wartość końcowa pochodzi z Open-Meteo; guard tylko kontroluje jej wiarygodność'));
    rows.push(fieldDecision('Ciśnienie',null,model.pressure,X.press,'Open-Meteo',false,'Głodowo nie dostarcza ciśnienia w tym feedzie'));
    rows.push(fieldDecision('Promieniowanie',null,model.radiation,X.rad,'Open-Meteo',false,'Głodowo nie dostarcza używanego pola promieniowania'));
    rows.push(fieldDecision('Punkt rosy',null,model.dewPoint,X.dewStation??X.dew,'Aura derived / IMGW RH',false,'wyliczany z temperatury i wilgotności; nie jest bezpośrednim pomiarem stacji'));
    rows.push(fieldDecision('Słońce / cień',null,model.sunShade,model.sunShade?.value??X.sunShade?.sun??null,'Aura derived',false,'wynik calcSunShadeTemp(); nie jest pomiarem stacji'));
    rows.push(fieldDecision('Wilgotność liści',null,null,null,'Aura derived',false,'modelowana z punktu rosy, RH, wiatru, chmur i opadu; brak fizycznego czujnika'));
    rows.push(fieldDecision('Gleba 0–1 cm',null,null,null,'brak danych',false,'aktualny endpoint nie pobiera soil_moisture_0_to_1cm; brak wartości nie jest zastępowany.'));
    return {capturedAt:Date.now(),station:window.__AURA_IMGW_COMPONENT_DIAG?.station||im.stacja||'Głodowo',distanceKm:Number.isFinite(distance)?distance:null,ttlMinutes:IMGW_TTL_MIN,canonicalLatestTimestamp:canonicalLatest?.timestamp||null,canonicalLatestTime:canonicalLatest?.time||null,canonicalLatestAgeMinutes:canonicalLatest?.ageMinutes??null,networkSource:diag.networkSource||null,networkFetchedAt:diag.networkFetchedAt||null,networkFetchedAtTime:diag.networkFetchedAt?fmtTime(diag.networkFetchedAt):null,networkStatus:diag.status||null,networkFallback:diag.isFallback===true,rows};
  }

  function heroCanonicalSnapshot(){
    sync();
    const d=window.__AURA_IMGW_COMPONENT_DIAG;
    if(!d)return null;
    return {station:d.station,distanceKm:d.distanceKm,latestField:d.latestField,latestTimestamp:d.latestTimestamp,latestTime:d.latestTime,latestAgeMinutes:d.latestAgeMinutes,ttlMinutes:d.ttlMinutes};
  }

  function patchHeroLabel(){
    try{
      const d=heroCanonicalSnapshot();if(!d)return;
      const hero=document.querySelector('#s-hero');if(!hero)return;
      const chips=hero.querySelectorAll('.chips .chip');let chip=null;
      chips.forEach(c=>{if(!chip&&/Głodowo|Glodowo/i.test(c.textContent||''))chip=c;});
      if(!chip)return;
      const ageMin=Number(d.latestAgeMinutes),age=d.latestAgeMinutes==null?'wiek nieznany':(Math.max(0,Math.round(d.latestAgeMinutes))<60?Math.max(0,Math.round(d.latestAgeMinutes))+' min temu':fmtAgeSafe(d.latestAgeMinutes)),fresh=Number.isFinite(ageMin)&&ageMin<=Number(d.ttlMinutes??IMGW_TTL_MIN),label=fresh?'ostatni świeży pomiar z':'ostatni odebrany pomiar z';
      chip.innerHTML=(typeof mini==='function'?mini('sat'):'')+esc2(d.station||'Głodowo')+', '+esc2(String(d.distanceKm??'—'))+', '+label+' '+esc2(d.latestTime||'—')+', '+esc2(age)+(fresh?'':' (nieaktualne)');
      chip.classList.remove('warn','ok');chip.classList.add(fresh?'ok':'warn');chip.title='Kanoniczny snapshot IMGW: '+String(d.latestTimestamp||'—')+' · pole: '+String(d.latestField||'—');
    }catch(err){console.debug('[AURA HERO IMGW]',err);}
  }

  function fmtAgeSafe(min){
    const m=Math.max(0,Math.round(Number(min)||0));if(m<60)return m+' min temu';
    const h=Math.floor(m/60),r=m%60;return r?h+' h '+r+' min temu':h+' h temu';
  }

  function observationFallbackDiagnosticsHTML(){
    const state=window.__AURA_STATE__||S||{};
    const candidates=Array.isArray(state.observationFallbackCandidates)?state.observationFallbackCandidates:(Array.isArray(window.__AURA_OBSERVATION_FALLBACK_CANDIDATES)?window.__AURA_OBSERVATION_FALLBACK_CANDIDATES:[]);
    if(!candidates.length){
      return '<div class="note" style="margin-top:8px"><b>Kandydaci fallbacku:</b> brak kandydatów w zakresie 2,5–45 km.</div>';
    }
    const rows=candidates.map((c,i)=>{
      const fresh=c.isFresh===true,eligible=c.eligible===true,used=eligible&&i===0;
      const fields=c.usableFields||{};
      const marks=['temperature','humidity','wind','windDirection'].map(k=>fields[k]?'✓':'—').join(' ');
      const age=c.ageMinutes==null?'wiek —':esc2(String(c.ageMinutes))+' min';
      const observed=c.observedAt?esc2(fmtTime(c.observedAt)||String(c.observedAt)):'—';
      const status=used?'✓ UŻYTO':eligible?'✓ KANDYDAT':'✕ ODRZUCONO';
      const reason=eligible?'świeży + ma używalne pola':(c.rejectReason||'brak powodu');
      const source=c.sourceLabel||c.station||'—';
      return '<tr>'
        +'<td>'+esc2(String(i+1))+'</td>'
        +'<td><b>'+esc2(c.station||'—')+'</b><br><small>'+esc2(source)+'</small></td>'
        +'<td>'+esc2(c.dist==null?'—':String(c.dist))+' km</td>'
        +'<td>'+observed+'<br><small>'+age+'</small></td>'
        +'<td style="white-space:nowrap">'+esc2(marks)+'</td>'
        +'<td><b style="color:'+(used?'var(--ok)':eligible?'var(--rain)':'var(--warn)')+'">'+status+'</b><br><small>'+esc2(reason)+'</small></td>'
        +'</tr>';
    }).join('');
    return '<div class="note" style="margin-top:12px;font-weight:700">🔎 KANDYDACI OBSERVATION_FALLBACK ('+candidates.length+')</div>'
      +'<div class="diag-xscroll" tabindex="0" aria-label="Kandydaci OBSERVATION_FALLBACK — przewijanie poziome">'
      +'<table style="width:max-content;min-width:760px;border-collapse:collapse;font-size:11px">'
      +'<thead><tr><th>#</th><th>Stacja / źródło</th><th>Odległość</th><th>Pomiar / wiek</th><th>Pola T RH W K</th><th>Decyzja</th></tr></thead>'
      +'<tbody>'+rows+'</tbody></table></div>';
  }

  function componentDiagnosticsHTML(){
    try{
      const all=buildAllComponentDiagnostics();if(!all)return '<div class="note">Brak danych diagnostycznych komponentów IMGW.</div>';
      const rows=all.rows||[];
      const tr=rows.map(r=>{
        const img=r.imgw||{},mod=r.model||{},status=r.decisionLabel||(r.decision==='USED'?'✓ UŻYTO IMGW':r.decision==='MODEL_ONLY'?'◉ MODEL':r.decision==='DERIVED'?'◌ WYLICZONO':r.decision==='SYSTEM'?'→ GUARD':r.decision==='SOURCE_ONLY'?'→ ŹRÓDŁO':r.decision==='VALUE'?'✓ WARTOŚĆ':'— BRAK DANYCH'),statusColor=r.decisionColor||(r.decision==='USED'?'var(--ok)':r.decision==='MODEL_ONLY'?'var(--rain)':r.decision==='DERIVED'?'var(--ink2)':r.decision==='SYSTEM'?'var(--ink2)':r.decision==='NO_DATA'?'var(--ink3)':'var(--ink2)');
        const imgText=img.value==null?'—':esc2(String(img.value))+(r.name==='Wiatr'||r.name==='Porywy'?' km/h':r.name==='Temperatura'?' °C':r.name==='Wilgotność'?' %':r.name==='Opad 10 min'?' mm':r.name==='Kierunek wiatru'?'°':'');
        const displayNum=(name,value)=>{if(value==null)return '—';const n=Number(value);if(!Number.isFinite(n))return esc2(String(value));return esc2(String(['Punkt rosy','Temperatura odczuwalna'].includes(name)?Number(n.toFixed(1)):value));};
        const modelText=displayNum(r.name,mod.value),finalText=displayNum(r.name,r.final?.value);
        const modelAge=mod.ageMinutes==null?'wiek —':mod.ageMinutes+' min';
        const modelSource=mod.source||'—';
        const modelExtra=mod.satelliteUsed===true
          ?' · 🛰️ pomiar '+esc2(mod.observationAt?fmtTime(mod.observationAt):'—')
          :'';
        const modelCell=modelText+'<br><small>'+esc2(modelSource)+' · '+modelAge+modelExtra+'</small>';
        return '<tr><td><b>'+esc2(r.name)+'</b></td><td>'+imgText+'<br><small>'+esc2(img.time||'—')+' · '+(img.ageMinutes==null?'wiek —':img.ageMinutes+' min')+' · TTL '+(img.ttlMinutes??IMGW_TTL_MIN)+' min</small></td><td>'+modelCell+'</td><td><b>'+finalText+'</b><br><small>'+esc2(r.final?.source||'—')+'</small></td><td><b style="color:'+statusColor+'">'+status+'</b><br><small>'+esc2(r.reason||'—')+'</small></td></tr>';
      }).join('');
      const freshFields=Object.entries(window.__AURA_IMGW_COMPONENT_DIAG?.components||{}).filter(([,x])=>x?.fresh).map(([k,x])=>k+' '+x.time+' ('+x.ageMinutes+' min)').join(' · ');
      const timeDiag=typeof window.AURA_TIME_DIAGNOSTICS==='function'?window.AURA_TIME_DIAGNOSTICS():null;
      const canonicalImgwTimestamp=window.__AURA_IMGW_COMPONENT_DIAG?.latestTimestamp??all.canonicalLatest??null;
      const imgwEpoch=typeof window.AURA_PARSE_TIMESTAMP==='function'?window.AURA_PARSE_TIMESTAMP(canonicalImgwTimestamp):null;
      const nowEpoch=timeDiag?.nowMs??Date.now(),ageFromEpoch=Number.isFinite(imgwEpoch)?Math.round(((nowEpoch-imgwEpoch)/60000)*10)/10:null,utcNow=Number.isFinite(nowEpoch)?new Date(nowEpoch).toISOString():'—',plNow=timeDiag?.localNow??'—',offsetLabel=Number.isFinite(timeDiag?.offsetMinutes)?(timeDiag.offsetMinutes>=0?'+':'')+timeDiag.offsetMinutes+' min':'—';
      const auraTimeBlock='<div class="note" style="margin-top:16px;font-weight:700">🕐 CZAS AURY</div><div class="note" style="line-height:1.65"><b>Strefa:</b> Europe/Warsaw · <b>PL:</b> '+esc2(plNow)+' · <b>UTC:</b> '+esc2(utcNow)+' · <b>offset:</b> '+esc2(offsetLabel)+'<br><b>IMGW timestamp:</b> '+esc2(canonicalImgwTimestamp||'—')+' · <b>epoch:</b> '+(Number.isFinite(imgwEpoch)?esc2(String(imgwEpoch)):'—')+'<br><b>Wiek z epoch:</b> '+(ageFromEpoch==null?'—':esc2(String(ageFromEpoch))+' min')+' · <b>Wiek diagnostyki:</b> '+(all.canonicalLatestAgeMinutes==null?'—':esc2(String(all.canonicalLatestAgeMinutes))+' min')+'</div>';
      const obsFallback=window.__AURA_STATE__?.observationFallback||null;
      const observationFallbackBlock='<div class="note" style="margin-top:16px;font-weight:700">📡 ŁAŃCUCH OBSERWACJI</div><div class="note" style="line-height:1.65"><b>Ścieżka:</b> Głodowo → OBSERVATION_FALLBACK → MODEL<br><b>Wybrane źródło:</b> '+esc2(window.__AURA_STATE__?.observationChain?.finalMode||'MODEL')+' · <b>stacja:</b> '+esc2(window.__AURA_STATE__?.observationChain?.selected?.station||'—')+' · <b>wiek:</b> '+(window.__AURA_STATE__?.observationChain?.selected?.ageMinutes==null?'—':esc2(String(window.__AURA_STATE__.observationChain.selected.ageMinutes))+' min')+'<br><b>Fallback:</b> '+(obsFallback?.isFresh?'AKTYWNY — używany przed modelem':'brak świeżej obserwacji')+' · <b>źródło:</b> '+esc2(obsFallback?.sourceLabel||'—')+' · <b>odległość:</b> '+(obsFallback?.dist==null?'—':esc2(String(obsFallback.dist))+' km')+' · <b>wiek:</b> '+(obsFallback?.ageMinutes==null?'—':esc2(String(obsFallback.ageMinutes))+' min')+'<br><b>Reguła:</b> Głodowo tylko gdy świeże i używalne → fallback obserwacyjny → model.</div>';
      return '<div class="note" style="margin-top:16px;font-weight:700">🧭 Pełna diagnostyka komponentów — RAW → źródło użyte → Aura</div>'
        +observationFallbackBlock
        +observationFallbackDiagnosticsHTML()
        +auraTimeBlock
        +'<div class="note">Kanoniczny snapshot Głodowa: <b>'+esc2(all.canonicalLatestTime||'—')+'</b> · '+(all.canonicalLatestAgeMinutes==null?'wiek —':esc2(String(all.canonicalLatestAgeMinutes))+' min')+' · TTL IMGW <b>'+IMGW_TTL_MIN+' min</b>.</div>'
        +'<div class="note">Połączenie IMGW: <b>'+esc2(all.networkSource||'—')+'</b> · pobrano odpowiedź: <b>'+esc2(all.networkFetchedAtTime||'—')+'</b> · '+(all.networkFallback?'użyto snapshotu lokalnego':'użyto odpowiedzi live API')+'.</div>'
        +'<div class="note">Świeże pola IMGW: '+esc2(freshFields||'brak')+'.</div>'
        +'<div class="note">Legenda: <b style="color:var(--ok)">✓ UŻYTO IMGW</b> · <b style="color:var(--rain)">◉ MODEL</b> · <b>◌ WYLICZONO</b> · <b>→ GUARD</b> · <b>— BRAK DANYCH</b>. „MODEL” oznacza prawidłową wartość końcową bez użycia świeżego IMGW, a nie błąd.</div>'
        +'<div class="diag-xscroll component-diag-scroll" tabindex="0" aria-label="Pełna diagnostyka komponentów — przewijanie poziome"><table class="component-diag-table" style="width:max-content;min-width:1100px;border-collapse:collapse;font-size:11px"><thead><tr><th>Komponent</th><th>IMGW RAW</th><th>Model / źródło</th><th>Aura final</th><th>Źródło użyte + powód</th></tr></thead><tbody>'+tr+'</tbody></table></div>';
    }catch(err){console.warn('[AURA COMPONENT DIAG]',err);return '<div class="note">⚠️ Diagnostyka komponentów chwilowo niedostępna.</div>';}
  }

  function patch(){
    sync();
    if(typeof window.render==='function'&&!window.__auraRenderPatched){
      const originalRender=window.render;
      window.render=function(){sync();const result=originalRender.apply(this,arguments);setTimeout(patchHeroLabel,0);setTimeout(patchHeroLabel,80);return result;};
      window.__auraRenderPatched=true;
    }
    if(typeof window.softUpdate==='function'&&!window.__auraSoftPatched){
      const originalSoft=window.softUpdate;
      window.softUpdate=function(){sync();const result=originalSoft.apply(this,arguments);setTimeout(patchHeroLabel,0);return result;};
      window.__auraSoftPatched=true;
    }
    if(typeof window.pipelineDiagnosticsText==='function'&&!window.__auraDiagTextPatched){
      const originalText=window.pipelineDiagnosticsText;
      window.pipelineDiagnosticsText=function(){
        sync();const base=originalText.apply(this,arguments);
        try{
          const obj=JSON.parse(base),d=window.__AURA_IMGW_COMPONENT_DIAG;
          obj.imgw=obj.imgw||{};obj.imgw.canonicalLatest=d?.latestTimestamp??null;obj.imgw.canonicalLatestTime=d?.latestTime??null;obj.imgw.canonicalLatestAgeMinutes=d?.latestAgeMinutes??null;obj.imgw.canonicalSnapshotCapturedAt=new Date().toISOString();obj.imgw.componentDiagnostics=d?.components??null;
          const cc=d?.components||{},cv=k=>cc?.[k]?.value??null,ct=k=>cc?.[k]?.timestamp??null,ca=k=>cc?.[k]?.ageMinutes??null,cf=k=>cc?.[k]?.fresh===true;
          obj.imgw.station=d?.station??obj.imgw.station??"Głodowo";obj.imgw.distanceKm=d?.distanceKm??obj.imgw.distanceKm??null;obj.imgw.status="online";obj.imgw.ageMinutes=d?.latestAgeMinutes??null;obj.imgw.temperature=cv("temperature");obj.imgw.humidity=cv("humidity");obj.imgw.wind=cv("wind");obj.imgw.gust=cv("gust");obj.imgw.rain10min=cv("rain10min");
          obj.imgw.fields={temperature:{value:cv("temperature"),timestamp:ct("temperature"),ageMinutes:ca("temperature"),fresh:cf("temperature")},humidity:{value:cv("humidity"),timestamp:ct("humidity"),ageMinutes:ca("humidity"),fresh:cf("humidity")},wind:{value:cv("wind"),timestamp:ct("wind"),ageMinutes:ca("wind"),fresh:cf("wind")},windDirection:{value:cv("windDirection"),timestamp:ct("windDirection"),ageMinutes:ca("windDirection"),fresh:cf("windDirection")},gust:{value:cv("gust"),timestamp:ct("gust"),ageMinutes:ca("gust"),fresh:cf("gust")},rain10min:{value:cv("rain10min"),timestamp:ct("rain10min"),ageMinutes:ca("rain10min"),fresh:cf("rain10min")}};
          obj.imgw.timestamps={temperature:ct("temperature"),humidity:ct("humidity"),wind:ct("wind"),windDirection:ct("windDirection"),gust:ct("gust"),rain10min:ct("rain10min")};
          obj.imgw.freshness={temperature:cf("temperature"),humidity:cf("humidity"),wind:cf("wind"),windDirection:cf("windDirection"),gust:cf("gust"),rain10min:cf("rain10min")};
          obj.geminiAnalysis=obj.geminiAnalysis||{};obj.geminiAnalysis.auraAtAnalysis=geminiAuraContext();obj.allComponentDiagnostics=buildAllComponentDiagnostics();obj.allComponentDiagnostics.observationFallbackCandidates=(window.__AURA_STATE__?.observationFallbackCandidates||window.__AURA_OBSERVATION_FALLBACK_CANDIDATES||[]);
          return JSON.stringify(obj,null,2);
        }catch{return base;}
      };
      window.__auraDiagTextPatched=true;
    }
    if(typeof window.openPipelineInspector==='function'&&!window.__auraOpenInspectorPatched){
      const originalOpen=window.openPipelineInspector;
      window.openPipelineInspector=function(){
        sync();const result=originalOpen.apply(this,arguments);
        setTimeout(()=>{
          const sheet=document.querySelector('#sheet-root .sheet');
          if(sheet){
            const old=sheet.querySelector('[data-aura-component-diagnostics]');if(old)old.remove();
            const wrap=document.createElement('div');wrap.dataset.auraComponentDiagnostics='1';wrap.innerHTML=componentDiagnosticsHTML();sheet.appendChild(wrap);
            Array.from(sheet.childNodes).forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&String(node.nodeValue||'').trim()==='undefined')node.remove();});
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
  setInterval(()=>{sync();patchHeroLabel();},30000);
})();