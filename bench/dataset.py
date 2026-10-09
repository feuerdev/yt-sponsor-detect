#!/usr/bin/env python3
"""Sequential public RSS / watch-caption / SponsorBlock acquisition. No inference."""
import argparse, datetime, hashlib, json, pathlib, re, urllib.request, urllib.error, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parent.parent
BENCH=ROOT/'bench'; LOCAL=BENCH/'local'; LOCAL.mkdir(exist_ok=True)
STAMP=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(data):return hashlib.sha256(data).hexdigest()
def encoded(value):return (json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def save(path,data):
 path.parent.mkdir(parents=True,exist_ok=True); temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);temp.replace(path)
def request(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 SponsorBenchmark/1.0','Accept-Language':'en-US,en;q=0.9'})
 with urllib.request.urlopen(req,timeout=20) as r:
  data=r.read(8*1024*1024+1)
  if len(data)>8*1024*1024:raise ValueError('response_too_large')
  return data
# Public English-oriented channels. Identity validated against RSS; unavailable
# feeds retained in discovery ledger, never fabricated into caption successes.
CHANNELS=[
 ('Linus Tech Tips','UCXuqSBlHAE6Xw-yeJA0Tunw'),('Marques Brownlee','UCBJycsmduvYEL83R_U4JriQ'),
 ('Veritasium','UCHnyfMqiRRG1u-2MsSQLbXA'),('SmarterEveryDay','UCUHW94eEFW7hkUMVaZz4eDg'),
 ('Tom Scott','UCBa659QWEk1AI4Tg--mrJ2A'),('Technology Connections','UCy0tKL1T7wFoYcxCe0xjN6Q'),
 ('Gamers Nexus','UChIs72whgZI9w6d6FhwGGHA'),('Hardware Unboxed','UCI8iQa1hv7oV_Z8D35vVuSg'),
 ('Kurzgesagt','UCsXVk37bltHxD1rDPwtNM8Q'),('Mark Rober','UCY1kMZp36IQSyNx_9h4mpCg'),
 ('Practical Engineering','UCMOqf8ab-42UUQIdVoKwjlQ'),('Real Engineering','UCR1IuLEqb6UEA_zQ81kwXfg'),
 ('Wendover Productions','UC9RM-iSvTu1uPJb8X5yp3EQ'),('CGP Grey','UC2C_jShtL725hvbm1arSV9w'),
 ('3Blue1Brown','UCYO_jab_esuFRV4b17AJtAw'),('Steve Mould','UCEIwxahdLz7bap-VDs9h35A'),
 ('Computerphile','UC9-y-6csu5WGm29I7JiwpnA'),('Numberphile','UCoxcjq-8xIDTYp3uz647V5A')]
EXCLUDED={'WSLW1A6Q5a4','I9zqGeH8EIs'}
# Published Ettin canary IDs are selection-contaminated; bootstrap diagnostic only.
report=ROOT/'bench/reference/ettin-excluded.json'
if report.exists():EXCLUDED.update(json.loads(report.read_text())['videoIds'])
def annotations(video_id):
 from urllib.parse import urlencode
 url='https://sponsor.ajay.app/api/skipSegments?'+urlencode({'videoID':video_id,'categories':'["sponsor","selfpromo"]'})
 try:return json.loads(request(url)), 'ok'
 except urllib.error.HTTPError as e:
  if e.code==404:return [],'no_submissions'
  raise

def discover():
 ledger=[];pool=[];ns={'a':'http://www.w3.org/2005/Atom','yt':'http://www.youtube.com/xml/schemas/2015'}
 for name,channel in CHANNELS:
  try:
   xml=request('https://www.youtube.com/feeds/videos.xml?channel_id='+channel);feed=ET.fromstring(xml)
   actual=feed.findtext('yt:channelId',namespaces=ns)
   if actual not in (channel,channel[2:]):raise ValueError('channel_identity_mismatch')
   for entry in feed.findall('a:entry',ns)[:6]:
    vid=entry.findtext('yt:videoId',namespaces=ns)
    if vid in EXCLUDED:
     ledger.append({'videoId':vid,'channelId':channel,'phase':'discovery','status':'excluded_published_example'});continue
    title=entry.findtext('a:title',namespaces=ns);published=entry.findtext('a:published',namespaces=ns)
    refs,status=annotations(vid)
    strata='paid' if any(x['category']=='sponsor' for x in refs) else ('challenging' if refs or re.search(r'review|test|product|phone|laptop|gpu|iphone|camera|bought|buy|best|worst|gift|affiliate',title,re.I) else 'ordinary')
    pool.append({'videoId':vid,'channelId':channel,'channelName':name,'title':title,'publishedAt':published,'stratum':strata,'referenceSource':'SponsorBlock','referenceSnapshotAt':STAMP(),'referenceStatus':status,'crowdReferences':refs,'captionAvailability':'pending','contamination':'unknown training-channel overlap; published examples excluded','campaignOverlap':'unknown until review'})
    ledger.append({'videoId':vid,'channelId':channel,'phase':'discovery','status':'ok','stratum':strata})
  except Exception as e:ledger.append({'channelId':channel,'phase':'discovery','status':'failure','reason':type(e).__name__+(':'+str(e.code) if isinstance(e,urllib.error.HTTPError) else ':'+str(e) if isinstance(e,ValueError) else '')})
  print('Discovery',name,len(pool),flush=True)
 # First ensure channel coverage; then fill intended strata, keeping all actual substitutions visible.
 selected=[];counts={'paid':0,'challenging':0,'ordinary':0};target={'paid':25,'challenging':15,'ordinary':10}
 for channel in sorted(set(x['channelId'] for x in pool)):
  group=[x for x in pool if x['channelId']==channel]
  group.sort(key=lambda x:(counts[x['stratum']]>=target[x['stratum']],x['stratum']!='paid',x['publishedAt']),reverse=False)
  selected.append(group[0]);counts[group[0]['stratum']]+=1
 for s in target:
  for x in pool:
   if len(selected)>=50 or counts[s]>=target[s]:break
   if x['stratum']==s and x not in selected:selected.append(x);counts[s]+=1
 for x in pool:
  if len(selected)>=50:break
  if x not in selected:selected.append(x);counts[x['stratum']]+=1
 channels=sorted(set(x['channelId'] for x in selected),key=lambda c:digest(c.encode()))
 tune=set(channels[:round(len(channels)*.6)])
 for x in selected:x['split']='tune' if x['channelId'] in tune else 'test'
 selection=[{k:v[k] for k in ('videoId','channelId','split','stratum')} for v in selected]
 return {'schemaVersion':1,'createdAt':STAMP(),'frozenAt':STAMP(),'selectionHash':digest(encoded(selection)),'targetVideos':50,'targetChannels':15,'samplingTarget':target,'actualStrata':counts,'channelCount':len(channels),'selectionVideos':len(selected),'splitMethod':'SHA-256 ordered whole channels; approximately 60/40; no threshold tuning before freeze','knownCampaignLeakage':'unknown; queue for human review before independent accuracy claims','substitutions':{s:counts[s]-target[s] for s in counts},'videos':selected,'attemptLedger':ledger}

def player_response(html):
 for marker in ['var ytInitialPlayerResponse =','ytInitialPlayerResponse =']:
  i=html.find(marker)
  if i>=0:
   j=html.find('{',i+len(marker));return json.JSONDecoder().raw_decode(html[j:])[0]
 raise ValueError('player_response_unavailable')
def normalize_json3(raw,duration):
 source=json.loads(raw);cues=[]
 for event in source.get('events',[]):
  text=''.join(x.get('utf8','') for x in event.get('segs',[])).strip()
  if not text:continue
  start=event.get('tStartMs',0)/1000;length=event.get('dDurationMs',0)/1000
  if length<=0:raise ValueError('nonempty_cue_without_duration')
  end=min(start+length,duration)
  if end>start:cues.append({'start':start,'end':end,'text':text})
 cues.sort(key=lambda c:(c['start'],c['end']))
 if not cues:raise ValueError('empty_captions')
 return cues

def acquire(v):
 html=request('https://www.youtube.com/watch?v='+v['videoId']+'&hl=en').decode('utf-8')
 p=player_response(html);details=p.get('videoDetails',{})
 if details.get('channelId')!=v['channelId']:raise ValueError('watch_channel_identity_mismatch')
 duration=float(details['lengthSeconds']);v['durationSeconds']=duration
 tracks=p.get('captions',{}).get('playerCaptionsTracklistRenderer',{}).get('captionTracks',[])
 tracks=[t for t in tracks if t.get('languageCode','').split('-')[0]=='en']
 if not tracks:raise ValueError('english_captions_unavailable')
 tracks.sort(key=lambda t:t.get('kind')=='asr')
 track=tracks[0];url=track['baseUrl']+'&fmt=json3'
 raw=request(url)
 if not raw:raise ValueError('empty_caption_response')
 cues=normalize_json3(raw,duration)
 refs=[]
 for r in v['crowdReferences']:
  start,end=r['segment']
  if start<0 or end<=start or end>duration:continue
  refs.append({'start':start,'end':end,'category':r['category'],'status':'provisional','source':v.get('referenceSource','SponsorBlock'),'votes':r.get('votes'),'locked':r.get('locked'),'uuid':r.get('UUID')})
 f={'videoId':v['videoId'],'channelId':v['channelId'],'durationSeconds':duration,'language':'en','cues':cues,'referenceSegments':refs,'reviewedNegativeIntervals':[],'annotationCompleteness':'partial',
  'provenance':{'captionSource':'YouTube timedtext discovered via public watch player','captionType':'automatic' if track.get('kind')=='asr' else 'manual','acquiredAt':STAMP(),'rawHash':digest(raw),'labelSource':v.get('referenceSource','SponsorBlock'),'labelSnapshotAt':v['referenceSnapshotAt'],'labelLicense':'CC-BY-NC-SA-4.0','captionRights':'YouTube terms; raw text not redistributed'}}
 data=encoded(f);save(LOCAL/'raw'/f"{v['videoId']}.json3",raw);save(LOCAL/'fixtures'/f"{v['videoId']}.json",data)
 v.update({'captionAvailability':'ok','durationSeconds':duration,'captionType':f['provenance']['captionType'],'rawSourceHash':digest(raw),'fixtureHash':digest(data),'acquiredAt':f['provenance']['acquiredAt'],'fixturePath':f"bench/local/fixtures/{v['videoId']}.json"})

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--manifest',default='bench/datasets/pilot.json');parser.add_argument('--discover-only',action='store_true');parser.add_argument('--retry-failures',action='store_true');args=parser.parse_args()
 path=ROOT/args.manifest
 m=json.loads(path.read_text()) if path.exists() else discover();save(path,encoded(m))
 if args.discover_only:return
 for v in m['videos']:
  if v['captionAvailability']=='ok':
   if not (ROOT/v['fixturePath']).exists() or digest((ROOT/v['fixturePath']).read_bytes())!=v['fixtureHash']:raise ValueError('frozen_fixture_missing_or_changed')
   continue
  if v['captionAvailability']=='failure' and not args.retry_failures:continue
  try:acquire(v);status='ok'
  except Exception as e:
   status='failure';v.update({'captionAvailability':'failure','acquiredAt':STAMP(),'acquisitionFailure':type(e).__name__+(':'+str(e.code) if isinstance(e,urllib.error.HTTPError) else ':'+str(e) if isinstance(e,ValueError) else '')})
  m['attemptLedger'].append({'videoId':v['videoId'],'channelId':v['channelId'],'phase':'captions','status':status,'reason':v.get('acquisitionFailure'),'at':STAMP()})
  save(path,encoded(m));print('Captions',v['videoId'],status,v.get('acquisitionFailure',''),flush=True)
 m['acquisitionSummary']={'selected':len(m['videos']),'available':sum(v['captionAvailability']=='ok' for v in m['videos']),'channelsSelected':len(set(v['channelId'] for v in m['videos'])),'channelsAvailable':len(set(v['channelId'] for v in m['videos'] if v['captionAvailability']=='ok')),'verifiedNegativeHours':0,'qualityClaims':'provisional reference agreement only'}
 save(path,encoded(m));print(json.dumps(m['acquisitionSummary']),flush=True)
if __name__=='__main__':main()
