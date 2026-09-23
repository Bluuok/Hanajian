"""Isolated geometry verification, not an Electron or artwork acceptance test."""
from pathlib import Path
import argparse, base64, json
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--chromium', default=None, help='Optional installed Chromium executable; otherwise use Playwright Chromium')
parser.add_argument('--output', type=Path, default=None, help='Output directory; defaults to a local review-output folder')
args=parser.parse_args()
root=Path(__file__).resolve().parent
output=(args.output or root/'review-output').resolve()
output.mkdir(parents=True, exist_ok=True)
html=(root/'layout.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="tokens.css">','<style>'+(root/'tokens.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="layout.css">','<style>'+(root/'layout.css').read_text(encoding='utf-8')+'</style>')
svg=base64.b64encode((root/'book-plant.svg').read_bytes()).decode()
html=html.replace('src="book-plant.svg"',f'src="data:image/svg+xml;base64,{svg}"')
records=[]
errors=[]

def assert_empty_art_bounds(image, width, state):
    assert image['w']<=80.1,(width,state,'art width',image)
    assert image['h']<=64.1,(width,state,'art height',image)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,args=['--no-sandbox'])
    version=browser.version
    for width,height in [(1182,745),(1073,668),(1280,800),(1440,900),(900,700),(700,600),(480,700)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(html)
        page.evaluate('document.fonts.ready')
        for state in ['ready','idle','loading','empty','error','ai_failed','invalid']:
            page.evaluate('(s)=>setState(s)',state)
            metrics=page.evaluate('''() => {
              const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
              const main=document.querySelector('.hj-main');
              return {mainOverflow:main.scrollWidth-main.clientWidth, pageOverflow:document.documentElement.scrollWidth-innerWidth,
                art:box('.hj-art'), state:box('.hj-state'), image:box('.hj-state img'), grid:box('.hj-evidence-grid'), related:box('.hj-related'),
                controls:[...document.querySelectorAll('.hj-controls>*')].map(el=>{let r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}})};
            }''')
            assert metrics['mainOverflow']<=1,(width,state,'main overflow',metrics)
            assert metrics['pageOverflow']<=1,(width,state,'page overflow')
            if state in ['idle','loading','empty','error']:
                assert_empty_art_bounds(metrics['image'],width,state)
                assert metrics['state']['h']<260,(width,state,'unbounded empty',metrics)
            if state=='ready' and metrics['art']['w']>0:
                assert metrics['art']['bottom']<=metrics['grid']['y'],(width,'hero over evidence',metrics)
                for control in metrics['controls']:
                    assert control['right']<=metrics['art']['x'],(width,'overlapped control',metrics)
            if state=='ready' and width>=1073:
                assert metrics['related']['bottom']<=height,(width,'fixture does not fit',metrics)
            records.append({'viewport':[width,height],'state':state,**metrics})
            if width in [1182,1073] and state in ['ready','idle']:
                page.screenshot(path=str(output/f'contract-{width}-{state}.png'))
        page.close()
    # Isolate every component at its intended parent width, not an entire-page width.
    isolated=[]
    for part,width in [('hero',530),('filter',520),('summary',520),('state',520),('evidence',414),('source',298),('related',822)]:
        page=browser.new_page(viewport={'width':width,'height':600})
        page.set_content(html)
        page.evaluate('(p)=>{document.body.dataset.isolate=p;setState(p==="state"?"idle":"ready")}',part)
        overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
        assert overflow<=1,(part,'isolate overflow',overflow)
        isolated.append({'part':part,'width':width,'overflow':overflow})
        page.close()
    # Mutation proves that the empty-art guard detects the original failure mode.
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.set_content(html)
    page.evaluate('setState("idle")')
    page.add_style_tag(content='.hj-state img{width:1000px!important;height:auto!important;max-width:none!important}')
    mutated_box=page.locator('.hj-state img').bounding_box()
    assert mutated_box is not None, 'negative control image is not visible'
    mutated_image={'w':mutated_box['width'],'h':mutated_box['height']}
    mutated_width=mutated_image['w']
    assert mutated_width > 96, ('negative control did not apply the oversized mutation', mutated_width)
    try:
        assert_empty_art_bounds(mutated_image,1440,'negative_control')
    except AssertionError as error:
        mutation_rejection=str(error)
    else:
        raise AssertionError(('negative control passed the same empty-art guard', mutated_image))
    page.close()
    browser.close()
assert not errors,errors
out={'scope':'isolated HTML/CSS geometry only; no Electron, backend, new hero asset or final visual acceptance','browser':version,'cases':len(records),'componentCases':isolated,'pageErrors':errors,'negativeControl':{'mutation':'empty-art width:1000px','observedWidth':mutated_width,'rejectedBySameGuard':True,'guardFailure':mutation_rejection},'records':records}
(output/'layout-checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k!='records'},ensure_ascii=False,indent=2))
