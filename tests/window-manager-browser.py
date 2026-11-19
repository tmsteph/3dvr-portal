from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':900})
 page.goto('file:///workspace/shared/3dvr-os-keyboard-window-manager-preview.html')
 page.get_by_role('button',name='Open Terminal').click()
 page.locator('#terminal-input').fill('help');page.locator('#terminal-input').press('Enter')
 assert page.locator('#terminal-input').evaluate('(e)=>e===document.activeElement')
 w=page.locator('#window-terminal')
 w.get_by_role('button',name='Tile left',exact=True).click()
 assert round(w.bounding_box()['width'])==640
 w.get_by_role('button',name='Maximize',exact=True).click()
 assert round(w.bounding_box()['width'])==1280
 w.get_by_role('button',name='Restore',exact=True).click()
 assert w.bounding_box()['width']<1280
 # programmatic cross-boundary selection triggers the same native selectionchange
 page.evaluate('''()=>{const a=document.querySelector('#terminal-output').firstChild;const b=document.querySelector('.welcome h1').firstChild;getSelection().setBaseAndExtent(a,0,b,3)}''')
 page.wait_for_timeout(80)
 assert page.evaluate("()=>document.querySelector('#terminal-output').closest('.window-body').contains(getSelection().focusNode)")
 page.evaluate("()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#terminal-output'));getSelection().removeAllRanges();getSelection().addRange(r)}")
 page.wait_for_timeout(80)
 assert 'help' in page.evaluate('()=>getSelection().toString()')
 page.screenshot(path='/workspace/shared/os-window-manager-desktop.png')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
 assert w.bounding_box()['width']<=390
 page.screenshot(path='/workspace/shared/os-window-manager-mobile.png')
 browser.close()
 print('PASS browser: Terminal focus/help, tile/maximize/restore, selection containment/copy, narrow viewport')
