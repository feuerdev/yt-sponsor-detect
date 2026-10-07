# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate synthetic algorithm oracles. No graph inference or video captions."""
import sys,json,random,hashlib,pathlib,argparse,subprocess
parser=argparse.ArgumentParser();parser.add_argument("--source",required=True);parser.add_argument("--output",default="tests/fixtures/ettin-upstream-parity.json");args=parser.parse_args()
base=pathlib.Path(args.source).resolve()
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=base,text=True).strip()!='6bfbf2b58490c22156836586f1ae27f437590154':raise ValueError('Upstream revision mismatch')
pins={'src/sponsor_detection/model/decoder.py':'85f1eb90e6663203033c1fbf7e935c1e0d87ce44e256f7664fcd5578b2aad9c7','src/sponsor_detection/inference/windowing.py':'9cbe42d690be297ed4b3cad0ad3a7e8e99fcea36fa948da5fb9d38150ba5aa99','src/sponsor_detection/inference/stitching.py':'7c9e7a23ddb7c1c319f847b9f3a7b2293b1c22332ec8f74dad7099a7232b0b28'}
for name,digest in pins.items():
 if hashlib.sha256((base/name).read_bytes()).hexdigest()!=digest:raise ValueError('Upstream source hash mismatch: '+name)
import tokenizers
if tokenizers.__version__!='0.22.2':raise ValueError('Python tokenizers version mismatch')
sys.path.insert(0,str(base/'src'))
from sponsor_detection.model.decoder import decode_bilou
from sponsor_detection.inference.windowing import TranscriptCue,assemble_transcript
from sponsor_detection.inference.stitching import WindowSponsorSpan,stitch_window_spans
from tokenizers import Tokenizer
repo=pathlib.Path(__file__).resolve().parents[2];tok=Tokenizer.from_file(str(repo/'bench/assets/ettin-int8/tokenizer.json'))
rng=random.Random(47)
normalizations=[]
for text in ['  Visit Example.COM/deal for 12:30 and 50.5 dollars.  ','HTTPS://EXAMPLE.ORG/deal\nTry WWW.example.net 123abc and x123.','Hello\u00a0\u2003 World! café 🐥','cafe\u0301 is a cafe\u0301','123,456 10:22 1.2.3 12x x12 _12 Ⅻ','İSTANBUL Ａ ١٢٣ ५०']:
 cues=[TranscriptCue(0,10000,20000,text),TranscriptCue(1,25000,30000,'A second cue.')];assembled=assemble_transcript(cues);encoded=tok.encode(assembled.text,add_special_tokens=False)
 normalizations.append({'cues':[{'start':c.start_ms/1000,'end':c.end_ms/1000,'text':c.text} for c in cues],'text':assembled.text,'ids':encoded.ids,'tokens':encoded.tokens,'offsets':encoded.offsets,'times':[[assembled.timestamp_for_character(a,end_boundary=False)/1000,assembled.timestamp_for_character(b,end_boundary=True)/1000] for a,b in encoded.offsets]})
cases=[]
for i in range(150):
 transcript=assemble_transcript([TranscriptCue(0,0,10000,'a'*80),TranscriptCue(1,20000,30000,'b'*80)])
 windows=[];spans=[]
 for w,start in enumerate([0,4,76,80]):
  offsets=[(j,j+1) for j in range(start,min(start+8,len(transcript.text)))];logits=[[rng.uniform(-4,4) for _ in range(5)] for _ in offsets]
  if i==0:logits=[[0,0,0,0,0] for _ in offsets]
  decoded=decode_bilou(logits,offsets);spans.extend(WindowSponsorSpan(w,s.start_char,s.end_char,s.confidence) for s in decoded.spans)
  windows.append({'tokens':[{'charStart':a,'charEnd':b,'start':transcript.timestamp_for_character(a,end_boundary=False)/1000,'end':transcript.timestamp_for_character(b,end_boundary=True)/1000} for a,b in offsets],'logits':logits})
 threshold=[0,.3,.7][i%3];gap_chars=[0,4,24][i%3];gap_ms=[0,1500,5000][i%3];expected=stitch_window_spans(transcript,spans,confidence_threshold=threshold,merge_gap_characters=gap_chars,merge_gap_ms=gap_ms)
 cases.append({'raw':{'windows':windows},'config':{'threshold':threshold,'mergeGapCharacters':gap_chars,'mergeGapSeconds':gap_ms/1000},'expected':[{'start':s.start_ms/1000,'end':s.end_ms/1000,'category':'sponsor','score':s.confidence} for s in expected]})
provenance={'repository':'seshuthota/Flow-SponsorML','revision':'6bfbf2b58490c22156836586f1ae27f437590154','files':{str(f.relative_to(base)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [base/'src/sponsor_detection/model/decoder.py',base/'src/sponsor_detection/inference/windowing.py',base/'src/sponsor_detection/inference/stitching.py']},'description':'Synthetic differential outputs from pinned upstream pure preprocessing/decoder, not model inference or captions','tokenizerRevision':'d4939256c49e92d158429a55fcf39477d003dd58','pythonTokenizers':'0.22.2'}
(repo/'tests/fixtures').mkdir(exist_ok=True)
(repo/args.output).write_text(json.dumps({'provenance':provenance,'normalizations':normalizations,'decoderCases':cases},separators=(',',':'))+'\n')
print('Generated',len(cases),'decoder cases and',len(normalizations),'normalization/token-offset cases')
