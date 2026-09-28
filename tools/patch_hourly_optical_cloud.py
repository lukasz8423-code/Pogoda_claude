from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
marker = '// AURA_HOURLY_OPTICAL_DISPLAY_V1'
if marker in s:
    print('Hourly optical cloud patch already present')
    raise SystemExit(0)

helper = r'''// AURA_HOURLY_OPTICAL_DISPLAY_V1
function hourlyOpticalCloudDisplay(data,index){
  try{
    const targetTime=data?.hourly?.time?.[index];
    if(targetTime==null)return null;
    const raw=S.activeModelRaw||data;
    const h=raw?.hourly;
    if(!Array.isArray(h?.time))return null;
    const si=findHourIndexByTime(h.time,targetTime);
    if(si<0)return null;
    const valueAt=(key)=>h?.[key]?.[si];
    const total=Number(valueAt('cloud_cover'));
    const low=Number(valueAt('cloud_cover_low'));
    const mid=Number(valueAt('cloud_cover_mid'));
    const high=Number(valueAt('cloud_cover_high'));
    if(![total,low,mid,high].every(Number.isFinite))return null;
    const current={
      cloud_cover:total,
      cloud_cover_low:low,
      cloud_cover_mid:mid,
      cloud_cover_high:high,
      is_day:Number.isFinite(Number(valueAt('is_day')))?Number(valueAt('is_day')):(isDayAt(targetTime)?1:0),
      weather_code:Number.isFinite(Number(valueAt('weather_code')))?Number(valueAt('weather_code')):0,
      sunshine_duration:Number(valueAt('sunshine_duration')),
      interval:Number(valueAt('interval'))||900,
      direct_normal_irradiance:Number(valueAt('direct_normal_irradiance')),
      shortwave_radiation:Number(valueAt('shortwave_radiation')),
      shortwave_radiation_instant:Number(valueAt('shortwave_radiation_instant'))
    };
    const optical=optiCloudFromModels([{model:raw?.__auraSourceMeta?.requestedModel||activeModel.id,data:{current}}]);
    if(!optical?.length)return null;
    return Number.isFinite(Number(optical[0].optical))?Math.round(Number(optical[0].optical)):null;
  }catch(err){
    console.debug('[AURA HOURLY OPTICAL CLOUD]',err);
    return null;
  }
}
'''
if 'function dailyRows(){' not in s:
    raise SystemExit('dailyRows not found')
s = s.replace('function dailyRows(){', helper + 'function dailyRows(){', 1)

old = '''    "relative_humidity_2m","pressure_msl","visibility","cape","lightning_potential","freezing_level_height"
  ];'''
new = '''    "relative_humidity_2m","pressure_msl","visibility","cape","lightning_potential","freezing_level_height",
    "sunshine_duration","direct_normal_irradiance","shortwave_radiation_instant"
  ];'''
if old not in s:
    raise SystemExit('commonHourly block not found')
s = s.replace(old, new, 1)

old_line = '''        const c=Math.round(clamp(Number(hourly.cloud_cover?.[k]??0),0,100));
        const hCode=getHourlyCode(hourly,k);'''
new_line = '''        const hCode=getHourlyCode(hourly,k);
        const hoursAhead=k-currentIdx;
        const rawCloud=Math.round(clamp(Number(hourly.cloud_cover?.[k]??0),0,100));
        const opticalCloud=(hoursAhead>=1&&hoursAhead<=3&&isDayAt(t))
          ?hourlyOpticalCloudDisplay(S.data,k)
          :null;
        const c=Number.isFinite(opticalCloud)?opticalCloud:rawCloud;'''
if old_line not in s:
    raise SystemExit('daily cloud line not found')
s = s.replace(old_line, new_line, 1)
p.write_text(s, encoding='utf-8')
print('Patched index.html')
