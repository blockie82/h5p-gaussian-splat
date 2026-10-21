"""Builds the content bank demo packages (Bovisands splat + Accordion, Multiple Choice,
True/False and Image) into an output folder.

Usage: python3 demo/build-demo.py <out-dir> <h5p-libraries-dir> [more-libraries-dirs...]

The libraries dirs must contain unpacked H5P libraries (e.g. H5P.Accordion-1.0,
H5P.MultiChoice-1.16, H5P.TrueFalse-1.8, H5P.Image-1.1, H5P.Question-1.5,
H5P.JoubelUI-1.3, ...), for example extracted from .h5p files downloaded from h5p.org.
"""
import json, os, shutil, subprocess, uuid, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) < 3:
    sys.exit(__doc__)
OUT=os.path.abspath(sys.argv[1]); shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
LIBDIRS=[os.path.abspath(d) for d in sys.argv[2:]]+[f'{ROOT}/libraries',f'{ROOT}/vendor',f'{ROOT}/vendor-example']
def lib_paths():
    found={}
    for d in LIBDIRS:
        for n in os.listdir(d):
            if os.path.isfile(os.path.join(d,n,'library.json')): found[n]=os.path.join(d,n)
    return found
LIBS=lib_paths()
def sub(lib, params, title='Untitled'):
    return {"library":lib,"params":params,"subContentId":str(uuid.uuid4()),"metadata":{"contentType":lib.split()[0].split('.')[-1],"license":"U","title":title}}
def text(html): return sub("H5P.AdvancedText 1.1",{"text":html},"Text")
def pkg(filename, title, main, content, files={}):
    st=f'{OUT}/stage-{filename}'; shutil.rmtree(st,ignore_errors=True); os.makedirs(f'{st}/content')
    mj,mv=main.split(' '); ma,mi=mv.split('.')
    json.dump({"title":title,"language":"en","mainLibrary":mj,"embedTypes":["iframe"],"license":"U","defaultLanguage":"en",
               "preloadedDependencies":[{"machineName":mj,"majorVersion":ma,"minorVersion":mi}]+([{"machineName":"H5P.AdvancedText","majorVersion":"1","minorVersion":"1"}] if 'AdvancedText' in json.dumps(content) else [])},
              open(f'{st}/h5p.json','w'))
    json.dump(content,open(f'{st}/content/content.json','w'),ensure_ascii=False)
    for rel,srcp in files.items():
        os.makedirs(os.path.dirname(f'{st}/content/{rel}'),exist_ok=True); shutil.copy(srcp,f'{st}/content/{rel}')
    for n,p in LIBS.items(): shutil.copytree(p,f'{st}/{n}')
    subprocess.run(['zip','-r','-D','-X','-q',f'{OUT}/{filename}','.'],cwd=st,check=True)
    shutil.rmtree(st)
    print('built',filename)

# Shared Gaussian splat defaults from the example
base=json.load(open(f'{ROOT}/example/content/content.json'))
def splat_content(file_rel, camera, alt, hotspots, start='orbit'):
    c=json.loads(json.dumps(base))
    c['splat']['file']={"path":file_rel,"mime":"application/octet-stream","copyright":{"license":"U"}}
    c['splat']['cameraView']=camera; c['splat']['alt']=alt
    c['behaviour']['startMode']=start
    c['hotspots']={"hotspots":hotspots}
    c['visuals'].pop('poster',None)
    return c

bov=json.load(open(f'{ROOT}/example/content/content.json'))
pkg('bovisands.h5p','Bovisands cove (3D)','H5P.GaussianSplat 1.0',bov,{'files/scene.txt':f'{ROOT}/example/content/files/scene.txt','images/poster.jpg':f'{ROOT}/example/content/images/poster.jpg'})

acc={"panels":[
 {"title":"Folds","content":text("<p>A fold is a bend in rock layers that were once flat. Folds form when rocks are squeezed by movements in the Earth's crust.</p>")},
 {"title":"Cleavage","content":text("<p>Cleavage is a set of closely spaced planes along which a rock splits easily. It forms when fine-grained rock is squeezed, which lines up its minerals.</p>")},
 {"title":"Sedimentary layers","content":text("<p>Sedimentary rocks build up as layers of sand and mud settle, usually under water, and are slowly turned into rock.</p>")}],"hTag":"h2"}
pkg('rock-features.h5p','Rock features','H5P.Accordion 1.0',acc)

mc={"media":{"disableImageZooming":False},"question":"<p>What forms cleavage in a rock?</p>",
 "answers":[
  {"correct":True,"text":"<div>The rock being squeezed</div>","tipsAndFeedback":{"tip":"","chosenFeedback":"<div>Correct: pressure lines up the minerals.</div>","notChosenFeedback":""}},
  {"correct":False,"text":"<div>Waves wearing the rock away</div>","tipsAndFeedback":{"tip":"","chosenFeedback":"<div>Waves erode rock, but they don't create cleavage.</div>","notChosenFeedback":""}},
  {"correct":False,"text":"<div>Rain dissolving the rock</div>","tipsAndFeedback":{"tip":"","chosenFeedback":"<div>Not quite: think about pressure.</div>","notChosenFeedback":""}}],
 "overallFeedback":[{"from":0,"to":100}],
 "behaviour":{"enableRetry":True,"enableSolutionsButton":True,"enableCheckButton":True,"type":"auto","singlePoint":False,"randomAnswers":True,"showSolutionsRequiresInput":True,"confirmCheckDialog":False,"confirmRetryDialog":False,"autoCheck":False,"passPercentage":100,"showScorePoints":True}}
pkg('check-understanding.h5p','Check your understanding','H5P.MultiChoice 1.16',mc)

tf={"media":{"disableImageZooming":False},"question":"<p>The rock layers at Bovisand Bay are still lying flat, just as they were laid down.</p>","correct":"false",
 "behaviour":{"enableRetry":True,"enableSolutionsButton":True,"enableCheckButton":True,"confirmCheckDialog":False,"confirmRetryDialog":False,"autoCheck":False}}
pkg('true-false.h5p','True or false?','H5P.TrueFalse 1.8',tf)

img={"file":{"path":"images/bay.jpg","mime":"image/jpeg","width":900,"height":507,"copyright":{"license":"U"}},"alt":"The rocky cove at Bovisand Bay with folded rock layers on a pebble beach.","decorative":False}
pkg('bay-photo.h5p','Bovisand Bay','H5P.Image 1.1',img,{'images/bay.jpg':f'{ROOT}/example/content/images/poster.jpg'})
