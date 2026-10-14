#!/usr/bin/env python3
"""Check that a theme's text/background pairings are readable (WCAG contrast).

    python3 tools/check-contrast.py theme.css

Prints the contrast ratio for every pairing the app uses and flags any below 4.5:1
(3:1 for the accent-coloured text sitting on cards). The original (Cancún) palette is a
soft, low-contrast one, so it flags several; a new theme should aim for none.
"""
import re, sys
def tokens(path):
    t = {}
    text = open(path).read()
    for m in re.finditer(r'--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;', text): t[m.group(1)] = m.group(2)
    for m in re.finditer(r'--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)\s*;', text):   # aliases, e.g. --sel-ring: var(--accent2)
        if m.group(2) in t: t[m.group(1)] = t[m.group(2)]
    return t
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def run(path):
    t = tokens(path); W='#FFFFFF'
    pairs = [
     ('text on main','text','main',4.5),('text-soft on main','text-soft','main',4.5),('text-soft on main-soft','text-soft','main-soft',4.5),
     ('text on main-soft','text','main-soft',4.5),
     ('title accent (accent2-on-main) on main','accent2-on-main','main',4.5),('danger-on-main on main','danger-on-main','main',4.5),
     ('on-accent on accent (buttons, chips on, today)','on-accent','accent',4.5),
     ('white on accent-deep','#W','accent-deep',4.5),('white on accent2 (filter on, view on, chip on)','#W','accent2',4.5),
     ('white on accent2-deep (tags)','#W','accent2-deep',4.5),('white on danger (late, P1)','#W','danger',4.5),
     ('ink on surface','ink','surface',4.5),('ink-soft on surface','ink-soft','surface',4.5),
     ('accent-ink on surface (chips/mini)','accent-ink','surface',4.5),('accent2 on surface (mini, chip text)','accent2','surface',4.5),
     ('danger on surface (gate msg, remove)','danger','surface',4.5),
     ('toast','toast-text','toast-bg',4.5),
     ('selected-day ring on main-soft','sel-ring','main-soft',3.0),('selected-day ring on surface','sel-ring','surface',3.0),
     ('sync dot live on main','accent2-on-main','main',3.0),('sync dot error on main','danger-on-main','main',3.0),
    ]
    for s in ('todo','assigned','started','part','done'):
        pairs += [(f'stage {s}: head text on head','stage-%s-head-text'%s,'stage-%s-head'%s,4.5),
                  (f'stage {s}: ink on card','ink','stage-%s-card'%s,4.5),(f'stage {s}: card-text-soft on card','card-text-soft','stage-%s-card'%s,4.5),
                  (f'stage {s}: accent-ink on card (room chip? mini)','accent-ink','stage-%s-card'%s,3.0),
                  (f'stage {s}: ink-soft on card (tag.room border/meta)','ink-soft','stage-%s-card'%s,4.5)]
    bad=0
    for name,a,b,need in pairs:
        fa = W if a=='#W' else t.get(a); fb = t.get(b)
        if not fa or not fb: print('??', name, a, b); continue
        r = cr(fa,fb); flag = '' if r>=need else '  <-- below %.1f'%need
        if flag: bad+=1
        print(f'{r:5.2f}  {name}{flag}')
    print('below threshold:', bad)
if len(sys.argv) != 2: sys.exit(__doc__)
print('=====', sys.argv[1]); run(sys.argv[1])
