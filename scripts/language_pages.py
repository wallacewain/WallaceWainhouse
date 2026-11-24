"""
Builds the language apps pages: /language-apps/ (every app, with a link to each) and one page per app,
like its Play listing: screenshots, what's in it, how to get it and how to use it.

    python scripts/language_pages.py [--shots]

--shots also copies and shrinks the screenshots from the app projects (../learn slovak 2/SlovakDrive/store*,
and the web apps' captures in scripts/shots/) into language-apps/<app>/img/. Pages are written with CRLF, as
the rest of the site.
"""
import html, pathlib, sys

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "language-apps"
APPS_SRC = SITE.parent / "learn slovak 2" / "SlovakDrive"
SHOTS_WEB = SITE / "scripts" / "shots"

PLAY = "https://play.google.com/store/apps/details?id=com.thewainhouse.{}drive"
TEST = "https://play.google.com/apps/testing/com.thewainhouse.{}drive"
GROUP = "https://groups.google.com/g/{}-drive-testers"

DRIVE = [
    dict(slug="slovak", name="Slovak Drive", icon="slovak.png", who="Everyday Slovak, beginner upwards",
         lang="Slovak", phrases="3,380", passages="141", dialogues="16",
         cmds=[("nemám šajnu", "", "I don't know"), ("ľahučké", "", "easy"), ("zopakuj", "", "say it again")],
         shots=[("store/phone_home.png", "The home screen: today's progress and how much of everyday speech you know"),
                ("store/phone_landscape.png", "In landscape, for a phone on the dashboard")],
         about=["Slovak as people really speak it, in the order you'll actually hear it: the phrases are ranked by how "
                "often their words come up in real spoken Slovak (film and TV subtitles), so the most useful come first.",
                "Every form of a word counts as its own word, because that's how you hear it: <i>som, si, je, sme</i>, "
                "<i>mám, máš, má</i>. The commonest forms come early and in short phrases you'd really say.",
                "Everyday life: shops, family, work, small talk, the fillers and reactions that make you sound natural.",
                "Short conversations, then longer passages at natural speed, built up slowly and in chunks first."]),
    dict(slug="cantonese", name="Cantonese Drive", icon="cantonese.png", who="Hong Kong Cantonese, with jyutping on screen",
         lang="Cantonese", phrases="2,380", passages="23", dialogues="12",
         cmds=[("唔知", "m4 zi1", "I don't know"), ("好易", "hou2 ji6", "easy"), ("再嚟", "zoi3 lai4", "say it again")],
         shots=[("store-yue/phone_home.png", "Characters with jyutping, and the English underneath"),
                ("store-yue/phone_landscape.png", "In landscape, for a phone on the dashboard")],
         about=["Hong Kong Cantonese as it's spoken, not written Chinese read aloud: the phrases are ranked by how often "
                "their words come up in real conversation (the Hong Kong Cantonese Corpus of recorded speech) and in "
                "film and TV.",
                "Every phrase on screen in characters with jyutping, so you can see the tones while you hear them.",
                "Speech recognition trained for Cantonese, running on your phone, so it can hear your answers and the "
                "three command words.",
                "Short conversations, then longer passages at natural speed, built up slowly and in chunks first."]),
    dict(slug="spanish", name="Spanish Drive", icon="spanish.png", who="Spain Spanish, covers the GCSE word list",
         lang="Spanish", phrases="2,731", passages="40", dialogues="5",
         cmds=[("ni idea", "", "I don't know"), ("chupado", "", "easy"), ("repite", "", "say it again")],
         shots=[("store-es/phone_1.png", "A new phrase: hear the English, say the Spanish"),
                ("store-es/phone_2.png", "The answer, with the English underneath")],
         about=["Spanish from Spain, with natural voices from Spain.",
                "Covers every word on the GCSE Spanish vocabulary list (AQA), in short phrases you'd really say, "
                "so it doubles as exam revision.",
                "Ranked by how often the words come up in real spoken Spanish, so the most useful come first.",
                "Short conversations, then longer passages at natural speed, built up slowly and in chunks first."]),
    dict(slug="french", name="French Drive", icon="french.png", who="France French, beginner to advanced",
         lang="French", phrases="3,145", passages="40", dialogues="7",
         cmds=[("aucune idée", "", "I don't know"), ("fastoche", "", "easy"), ("répète", "", "say it again")],
         shots=[("store-fr/phone_1.png", "A new phrase: hear the English, say the French"),
                ("store-fr/phone_2.png", "The answer, with the English underneath")],
         about=["Over 3,000 phrases, in the order you'll actually hear them: built from how often words come up in "
                "real spoken French, so the most useful come first.",
                "Everyday French as people really speak it, not textbook French: the fillers, the reactions, the "
                "dropped <i>ne</i>, and the slang you need to understand.",
                "Every main tense, the conditional and the subjunctive, in short phrases you'd really say.",
                "Dialogues, then longer passages heard at natural speed, built up slowly and in chunks until you can "
                "follow them."]),
]

WEB = [
    dict(slug="parler-vrai", name="Parler vrai", icon="parler-vrai.png", who="For fluent French speakers who want to sound native",
         url="https://wallacewain.github.io/pv-43fa00b2adf3/",
         shots=[("pv_1.png", "Textbook French on top: say it the way a native would, then hear it"),
                ("pv_2.png", "The everyday version, with the English and the textbook one underneath"),
                ("pv_settings.png", "Settings: pace, save for offline, back up your progress")],
         intro="For people who already speak French well and want to sound like it's their first language. You hear "
               "the textbook version, or the English, say it out loud the way a Parisian would, then hear how a "
               "native says it.",
         about=["<strong>Casual speech</strong> (123 phrases): <i>je ne sais pas</i> becomes <i>j'sais pas</i>; the "
                "dropped <i>ne</i>, <i>on</i> for <i>nous</i>, the questions people actually ask.",
                "<strong>Idioms and slang</strong> (104): what natives say without thinking, with the word-for-word "
                "meaning so they stick.",
                "<strong>Work French</strong> (69): emails, meetings and calls, from <i>je reviens vers vous</i> to "
                "<i>on se cale un point</i>.",
                "<strong>Swiss French</strong> (29): <i>septante</i>, <i>nonante</i>, <i>dîner</i> for lunch, "
                "<i>ça joue</i>, for French-speaking Switzerland.",
                "<strong>Fast listening</strong> (11): everyday conversations at full speed, then again with the words."],
         use=["Every card: <strong>say it out loud</strong>, even when you're sure. The point is for the native way to "
              "come out by itself.",
              "<strong>Tap the screen</strong> if you missed it, or said it the textbook way: it's taught again and "
              "comes back sooner. Otherwise it moves on by itself.",
              "Listening pieces play fast first with only a title, then again with the words.",
              "Headphone buttons work: ⏮ means missed it, ⏭ skips ahead. Keep the page open while it plays: iPhones "
              "pause web pages when they're locked."]),
    dict(slug="bundner-deutsch", name="Bündner Deutsch", icon="swiss.png", who="Swiss German as spoken in Graubünden, real recordings",
         url="https://wallacewain.github.io/bd-4905dad8adbe/",
         shots=[("bd_1.png", "Hear the English, say it in Swiss German"),
                ("bd_2.png", "Then hear a Bündner say it, with a word-for-word line"),
                ("bd_settings.png", "Settings: pace, save for offline, back up your progress")],
         intro="Swiss German as it's spoken in Graubünden (around Chur and St. Moritz), not standard German. You hear "
               "a phrase in English, say it out loud in Swiss German, then hear a real Bündner say it.",
         about=["493 phrases recorded by native speakers from Graubünden (the SwissDial recordings, ETH Zürich), not "
                "a computer voice: there isn't one for the dialect.",
                "Everyday phrases first, each with a word-for-word line so you can see how the dialect is built.",
                "Spaced repetition: each phrase comes back at growing gaps, just before you'd forget it."],
         use=["<strong>Say it out loud</strong> in the gap, then listen to the answer.",
              "No voice commands: <strong>tap the screen</strong> if you missed it. It's taught again and comes back "
              "sooner. Otherwise it moves on by itself.",
              "Headphone buttons work: ⏮ means missed it, ⏭ skips ahead. Keep the page open while it plays: iPhones "
              "pause web pages when they're locked."]),
]

# ── the page shell ────────────────────────────────────────────────────────────

LOGO = ('<svg viewBox="-323 -28 2446 296" height="18" xmlns="http://www.w3.org/2000/svg" aria-label="WMW" fill="currentColor">'
        + "".join(f'<polygon points="{p}"/>' for p in [
            "-279.60,-4.00 -298.80,10.40 -123.60,244.00 -104.40,229.60", "-54.00,229.60 -34.80,244.00 140.40,10.40 121.20,-4.00",
            "210.00,-4.00 190.80,10.40 366.00,244.00 385.20,229.60", "435.60,229.60 454.80,244.00 630.00,10.40 610.80,-4.00",
            "699.60,-4.00 680.40,10.40 855.60,244.00 874.80,229.60", "925.20,229.60 944.40,244.00 1119.60,10.40 1100.40,-4.00",
            "1189.20,-4.00 1170.00,10.40 1345.20,244.00 1364.40,229.60", "1414.80,229.60 1434.00,244.00 1609.20,10.40 1590.00,-4.00",
            "1678.80,-4.00 1659.60,10.40 1834.80,244.00 1854.00,229.60", "1904.40,229.60 1923.60,244.00 2098.80,10.40 2079.60,-4.00"])
        + "</svg>")

STYLE = """
    .la { max-width: 760px; padding-bottom: 4rem; }
    .la h2 { font-size: 1.6rem; margin: 3rem 0 1rem; }
    .la p, .la li { color: #d4d4d8; }
    .la p { margin-bottom: 1rem; }
    .la ol, .la ul { margin: 0 0 1rem 1.4rem; }
    .la li { margin-bottom: 0.5rem; }
    .la strong { color: var(--text); }
    .crumb { margin: 2.5rem 0 0; font-size: 0.9rem; }
    .crumb a { color: var(--muted); text-decoration: none; }
    .crumb a:hover { color: var(--text); }
    .calm { border: 1px solid var(--border); border-left: 3px solid var(--accent); background: var(--surface);
            border-radius: var(--radius); padding: 1.25rem 1.5rem; margin: 1.5rem 0; }
    .calm p:last-child { margin-bottom: 0; }
    .share { border: 1px solid #3f3f46; background: linear-gradient(135deg, rgba(99,102,241,0.14), rgba(99,102,241,0.04));
             border-radius: var(--radius); padding: 1.25rem 1.5rem; margin: 1.5rem 0; }
    .share p:last-child { margin-bottom: 0; }
    .apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 1rem; margin: 1.5rem 0; }
    a.app { display: block; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius);
            padding: 1.25rem; color: inherit; text-decoration: none; transition: border-color .15s, transform .15s; }
    a.app:hover { border-color: var(--accent); transform: translateY(-2px); }
    .app .top { display: flex; align-items: center; gap: 0.9rem; }
    .app img { width: 56px; height: 56px; border-radius: 12px; }
    .app h3 { font-size: 1.15rem; margin: 0; }
    .app .who { color: var(--muted); font-size: 0.85rem; }
    .app .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.85rem; }
    .tag { color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0.15rem 0.6rem; }
    .go { color: var(--accent-hover); font-weight: 600; }
    .head { display: flex; align-items: center; gap: 1.25rem; margin: 1.5rem 0 1rem; }
    .head img { width: 96px; height: 96px; border-radius: 22px; }
    .head h1 { font-size: clamp(2rem, 5vw, 2.8rem); line-height: 1.1; margin: 0 0 0.3rem; }
    .head .who { color: var(--muted); }
    .facts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1.5rem; }
    .btn { display: inline-block; background: var(--accent); color: #fff; font-weight: 600; border-radius: 999px;
           padding: 0.7rem 1.4rem; text-decoration: none; margin: 0.25rem 0 1rem; }
    .btn:hover { background: var(--accent-hover); }
    .shots { display: flex; gap: 0.9rem; overflow-x: auto; padding: 0.25rem 0 1rem; scroll-snap-type: x mandatory; }
    .shots figure { margin: 0; flex: none; scroll-snap-align: start; }
    .shots img { height: 440px; width: auto; border-radius: 14px; border: 1px solid var(--border); display: block; }
    .shots figcaption { color: var(--muted); font-size: 0.8rem; margin-top: 0.4rem; max-width: 248px; }
    .shots figure.wide figcaption { max-width: 560px; }
    @media (max-width: 600px) { .shots img { height: 380px; } }
    .steps { counter-reset: s; list-style: none; margin-left: 0 !important; }
    .steps li { counter-increment: s; position: relative; padding-left: 2.6rem; margin-bottom: 1rem; }
    .steps li::before { content: counter(s); position: absolute; left: 0; top: -0.1rem; width: 1.8rem; height: 1.8rem;
           border-radius: 50%; background: var(--surface); border: 1px solid var(--border); color: var(--text);
           display: grid; place-items: center; font-weight: 600; font-size: 0.9rem; }
    .cmds { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin: 1rem 0 1.5rem; }
    .cmd { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); padding: 0.9rem 1rem; }
    .cmd b { display: block; font-size: 1.25rem; color: var(--text); }
    .cmd span { color: var(--muted); font-size: 0.9rem; }
    .others { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
    .others a { display: flex; align-items: center; gap: 0.5rem; border: 1px solid var(--border); border-radius: 999px;
                padding: 0.3rem 0.8rem 0.3rem 0.35rem; color: var(--text); text-decoration: none; font-size: 0.9rem; }
    .others a:hover { border-color: var(--accent); }
    .others img { width: 26px; height: 26px; border-radius: 7px; }
"""


def page(path, title, desc, body, og_title=None):
    url = "https://wallacewainhouse.com/" + path
    t, d = html.escape(title), html.escape(desc)
    og = html.escape(og_title or title)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{d}">
  <title>{t} &mdash; Wallace Wainhouse</title>
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Wallace Wainhouse">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{og}">
  <meta property="og:description" content="{d}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{og}">
  <meta name="twitter:description" content="{d}">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>{STYLE}  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
</head>
<body>
  <header>
    <nav>
      <a href="/" class="logo">{LOGO}</a>
      <ul><li><a href="/">Home</a></li><li><a href="/tools/">Tools</a></li><li><a href="/nice-reverb/">Nice Reverb</a></li></ul>
    </nav>
  </header>
  <main>
    <div class="la">
{body}
    </div>
  </main>
  <footer><p>&copy; <span id="yr"></span> Wallace Wainhouse</p></footer>
  <script src="/js/logo.js"></script>
  <script>document.getElementById('yr').textContent = new Date().getFullYear();</script>
</body>
</html>
"""


CALM = """      <div class="calm">
        <p><strong>Before you start:</strong> give your first sessions at least <strong>30 minutes of gentle focus</strong>.</p>
        <p>The first few minutes can feel overwhelming. That's completely normal, so please don't give up then: stick with it for the full half hour and it starts to fall into place.</p>
        <p>Don't worry at all if it feels like nothing is going in. That's normal, and it's fine. Just relax completely and trust the app to do the work: it brings every phrase back at the right moment, again and again, until it sticks. You don't need to try hard, take notes or remember anything on purpose. Just listen, have a go out loud, and keep going.</p>
      </div>"""

SHARE = """      <div class="share">
        <p><strong>Please share this page with as many friends as you can.</strong></p>
        <p>The Android apps are in testing on Google Play. Before they can go on the Play Store for everyone, Google needs enough people to join the test of each app. So please send it to everyone you know with an Android phone, even if they only try it once. Each person who joins gets the apps closer to a proper public release.</p>
      </div>"""


def shots_html(a):
    figs = []
    for i, (src, cap) in enumerate(a["shots"]):
        name = f"shot{i + 1}.jpg"
        wide = "landscape" in src
        cls = ' class="wide"' if wide else ""
        figs.append(f'        <figure{cls}><img src="img/{name}" alt="{html.escape(cap)}" loading="lazy">'
                    f"<figcaption>{html.escape(cap)}</figcaption></figure>")
    return '      <div class="shots">\n' + "\n".join(figs) + "\n      </div>"


def others(here):
    links = [f'<a href="../{x["slug"]}/"><img src="../img/{x["icon"]}" alt="">{x["name"]}</a>' for x in DRIVE + WEB if x["slug"] != here]
    return ('      <h2>The other apps</h2>\n      <div class="others">' + "".join(links) +
            '</div>\n      <p><a href="../">All the language apps</a></p>')


def head(a, facts):
    tags = "".join(f'<span class="tag">{f}</span>' for f in facts)
    return f"""      <p class="crumb"><a href="../">&larr; All language apps</a></p>
      <div class="head"><img src="../img/{a["icon"]}" alt=""><div><h1>{a["name"]}</h1><div class="who">{a["who"]}</div></div></div>
      <div class="facts">{tags}</div>"""


def drive_page(a):
    s = a["slug"]
    cmds = "".join(f'<div class="cmd"><b>{w}</b><span>{(r + " · ") if r else ""}{m}</span></div>' for w, r, m in a["cmds"])
    miss, easy, again = [c[0] for c in a["cmds"]]
    about = "\n".join(f"        <li>{x}</li>" for x in a["about"])
    body = f"""{head(a, ["Android", "Free", "In testing on Google Play", f'{a["phrases"]} phrases'])}
      <p>{a["name"]} teaches spoken {a["lang"]} while your hands and eyes are busy: driving, walking, cooking. You hear a phrase in English, say it in {a["lang"]} out loud, then hear a native speaker say it. It listens for your answer and moves on by itself, so your phone can stay in your pocket.</p>
      <a class="btn" href="#get">Get {a["name"]}</a>

{shots_html(a)}

      <h2>What's in it</h2>
      <ul>
{about}
        <li>{a["phrases"]} phrases, {a["dialogues"]} dialogues and {a["passages"]} longer passages.</li>
      </ul>

{CALM}

      <h2 id="get">Get it</h2>
      <p>It's for Android phones, and it's in testing on Google Play, so it takes three steps instead of one. Use the same Google account that your phone's Play Store uses.</p>
      <ol class="steps">
        <li><strong>Join the testers group:</strong> <a href="{GROUP.format(s)}">{s}-drive-testers</a>. Tap "Join group".</li>
        <li><strong>Become a tester:</strong> <a href="{TEST.format(s)}">open the test page</a> and tap "Become a tester". If it says the app isn't available, wait a few minutes after joining the group and open it again.</li>
        <li><strong>Install:</strong> <a href="{PLAY.format(s)}">{a["name"]} on Google Play</a>.</li>
        <li><strong>Open it once</strong> and allow the microphone and notifications.</li>
        <li><strong>Practise the three command words</strong> in Settings before your first session: tap one to hear how it's said, then say it yourself and the app shows whether it understood you.</li>
      </ol>

      <h2>The three words to know</h2>
      <p>Say these instead of an answer, or straight after one:</p>
      <div class="cmds">{cmds}</div>
      <ul>
        <li><strong>Didn't know it, or got it wrong?</strong> Say <b>{miss}</b>. It teaches it again and brings it back soon. There's no penalty: missing things is how the app knows what to practise.</li>
        <li><strong>Too easy?</strong> Say <b>{easy}</b> and it won't come back so often.</li>
        <li><strong>Want to hear it again?</strong> Say <b>{again}</b>.</li>
      </ul>

      <h2>How it works</h2>
      <ol>
        <li><strong>Press play.</strong> You hear a phrase in English.</li>
        <li><strong>Say it out loud</strong> in {a["lang"]}. Have a go even if you're not sure: guessing is part of learning.</li>
        <li><strong>Hear a native speaker say it.</strong> Repeat it after them if you like. The app listens for your answer and moves on by itself.</li>
      </ol>
      <p>New phrases come one or two at a time, mixed in with ones you've already met. Each phrase comes back at growing gaps, just before you'd forget it. That's why you don't need to try to remember: the app does the remembering for you.</p>
      <p>Later on you'll hear short conversations and longer passages at natural speed. They're built up slowly and in chunks first, and they only play once you know every word in them.</p>

      <h2>In the car, or with headphones</h2>
      <ul>
        <li>It works over Bluetooth and with your steering-wheel or headphone buttons: <strong>previous</strong> means you missed it, <strong>next</strong> skips ahead.</li>
        <li>Keep your eyes on the road: everything works by voice and buttons, so you never need to look at the screen.</li>
      </ul>

      <h2>Settings worth knowing</h2>
      <ul>
        <li><strong>Pace</strong>: how many new phrases a day. If it feels like too much, turn it down. You'll learn more from fewer phrases that stick.</li>
        <li><strong>Level</strong>: where new material starts, if you already know some {a["lang"]}.</li>
        <li><strong>Bedtime</strong>: a short last round of the day's trickiest phrases, then it stops.</li>
      </ul>

      <h2>Private and offline</h2>
      <p>No account, no ads and no internet needed. Everything runs on your phone, including the speech recognition. Your progress stays on your phone and is kept through updates.</p>

{SHARE}

{others(s)}"""
    desc = f'{a["name"]}: learn spoken {a["lang"]} hands-free. Hear English, say it out loud, hear a native speaker. Free for Android.'
    return page(f"language-apps/{s}/", a["name"], desc, body, f'{a["name"]} &mdash; learn spoken {a["lang"]} hands-free')


def web_page(a):
    about = "\n".join(f"        <li>{x}</li>" for x in a["about"])
    use = "\n".join(f"        <li>{x}</li>" for x in a["use"])
    body = f"""{head(a, ["iPhone and Android", "Free", "In the browser, nothing to install"])}
      <p>{a["intro"]}</p>
      <a class="btn" href="{a["url"]}">Open {a["name"]}</a>

{shots_html(a)}

      <h2>What's in it</h2>
      <ul>
{about}
      </ul>

      <h2>Get it</h2>
      <ol class="steps">
        <li><strong>Open <a href="{a["url"]}">{a["name"]}</a> on your phone.</strong> It runs in the browser on iPhone and Android: nothing to install, no account.</li>
        <li><strong>Add it to your home screen</strong> so it opens like an app. iPhone: in Safari, tap Share, then "Add to Home Screen". Android: in Chrome, tap ⋮, then "Add to Home screen".</li>
        <li><strong>Save it for offline:</strong> in its Settings, tap "Save for offline" so it works with no signal.</li>
      </ol>

      <h2>How to use it</h2>
      <ul>
{use}
      </ul>

      <h2>Your progress</h2>
      <p>Your progress is kept on your phone, in the browser. Back it up now and then in Settings: deleting the home screen icon or clearing the browser's data loses it. Restore puts it back, on the same phone or a new one.</p>

{CALM}

{others(a["slug"])}"""
    return page(f"language-apps/{a['slug']}/", a["name"], f'{a["name"]}: {a["who"]}. Free, in the browser on any phone.', body)


def index_page():
    def card(a, tag):
        return (f'        <a class="app" href="{a["slug"]}/"><div class="top"><img src="img/{a["icon"]}" alt=""><div><h3>{a["name"]}</h3>'
                f'<div class="who">{a["who"]}</div></div></div><div class="meta"><span class="tag">{tag}</span><span class="go">See the app &rarr;</span></div></a>')
    drive = "\n".join(card(a, "Android") for a in DRIVE)
    web = "\n".join(card(a, "Any phone, in the browser") for a in WEB)
    body = f"""      <section class="hero" style="padding-bottom:1rem">
        <h1>Learn to speak, hands-free</h1>
        <p>Free apps for Slovak, Cantonese, Spanish, French and Swiss German, plus one for fluent French speakers who want to sound native. You hear a phrase in English, say it out loud in the language, then hear a native speaker say it. It works while you drive, walk or cook, with your phone in your pocket.</p>
      </section>

{SHARE}

      <h2>The Drive apps</h2>
      <p>For Android phones: hands-free, with voice commands, and they work in the car.</p>
      <div class="apps">
{drive}
      </div>

      <h2>In the browser</h2>
      <p>For any phone, iPhone included: nothing to install.</p>
      <div class="apps">
{web}
      </div>

      <h2>How they work</h2>
      <ol>
        <li><strong>Hear a phrase in English.</strong></li>
        <li><strong>Say it out loud</strong> in the language. Have a go even if you're not sure: guessing is part of learning.</li>
        <li><strong>Hear a native speaker say it.</strong> The app moves on by itself.</li>
      </ol>
      <p>New phrases come one or two at a time, mixed in with ones you've already met, and each comes back at growing gaps, just before you'd forget it. The phrases are what people really say, in the order you'll actually hear them. No account, no ads, and your progress stays on your phone.</p>
      <p>Each app's page has screenshots, what's in it, how to get it and how to use it.</p>

{CALM}"""
    return page("language-apps/", "Language apps", "Slovak, Cantonese, Spanish, French and Swiss German: free apps that teach a spoken language hands-free. Hear English, say it out loud, hear a native speaker.",
                body, "Language apps &mdash; learn to speak, hands-free")


def shrink(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    h = 880   # twice the 440 px they're shown at
    if im.height > h: im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=85, optimize=True, progressive=True)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))


if __name__ == "__main__":
    if "--shots" in sys.argv:
        for a in DRIVE:
            for i, (src, _) in enumerate(a["shots"]): shrink(APPS_SRC / src, OUT / a["slug"] / "img" / f"shot{i + 1}.jpg")
        for a in WEB:
            for i, (src, _) in enumerate(a["shots"]): shrink(SHOTS_WEB / src, OUT / a["slug"] / "img" / f"shot{i + 1}.jpg")
    write(OUT / "index.html", index_page())
    for a in DRIVE: write(OUT / a["slug"] / "index.html", drive_page(a))
    for a in WEB: write(OUT / a["slug"] / "index.html", web_page(a))
    print("written:", 1 + len(DRIVE) + len(WEB), "pages")
