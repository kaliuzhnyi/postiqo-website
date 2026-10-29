"""Build the DWService Windows guide from the preserved client screenshots.

Screenshots are embedded unchanged. Crops are PDF clipping paths; all highlights
and action numbers are vector overlays. No pixels in the source PNGs are edited.
Requires reportlab, Pillow and pypdf. Optional PNG export also needs pdftoppm.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import reportlab
from PIL import Image
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "docs/support/dwservice-windows/screenshots"
W, H = 960, 640
INK = colors.HexColor("#142A43")
MUTED = colors.HexColor("#53677E")
BLUE = colors.HexColor("#0866D9")
PALE = colors.HexColor("#EDF4FE")
LINE = colors.HexColor("#DCE5F0")
ACTION = colors.HexColor("#DA493E")
CHECK = colors.HexColor("#087E73")
WAIT = colors.HexColor("#AC6A09")
WHITE = colors.white
PAGE_COUNT = 17
DOWNLOAD_URL = "https://www.dwservice.net/en/download.html"
INSTALL_URL = "https://docs.dwservice.net/docs/site/agent-installation-step-by-step/windows/windows-install-the-agent-with-credentials/"
ACCESS_URL = "https://docs.dwservice.net/docs/site/basic-definitions/unattended-access/"
DISABLE_URL = "https://docs.dwservice.net/docs/site/dwservice-installation/how-to-temporarily-disable-the-agent/"
REMOVE_URL = "https://docs.dwservice.net/docs/site/dwservice-installation/how-to-remove-the-agent/"


def mark(label, box, badge, kind="action"):
    return {"label": str(label), "box": box, "badge": badge, "kind": kind}


# Coordinates are pixels in the original PNG, with (0, 0) at its top left.
# The numbering inside each screenshot matches its action list on the left.
STEPS = [
    {
        "id": 1, "slug": "download-windows", "phase": "DOWNLOAD", "title": "Choose the Windows download",
        "subtitle": "Open the official download page on the computer that needs support.",
        "intro": '<link href="' + DOWNLOAD_URL + '" color="#0866D9"><b>dwservice.net/en/download.html</b></link>',
        "actions": [
            ("1", "Select Agent", "Use the <b>Agent</b> tab shown in the screenshot."),
            ("2", "Click Windows", "Click the tile with the Windows logo."),
        ],
        "note": ("Before you start", "You do not need to create a personal DWService account for this Postiqo setup."),
        "crop": (460, 245, 1380, 600),
        "marks": [mark(1, (1065, 322, 92, 47), (1020, 346)), mark(2, (500, 442, 202, 127), (471, 505))],
        "next": "A Windows download notice opens. Continue to screenshot 02.",
    },
    {
        "id": 2, "slug": "confirm-download", "phase": "DOWNLOAD", "title": "Read the notice and download",
        "subtitle": "Review the security notice, Privacy Policy and terms before continuing.",
        "actions": [
            ("1", "Tick the Privacy Policy box", "Read the linked Privacy Policy. Tick the box if you agree."),
            ("2", "Click DOWNLOAD", "Review the linked terms. Click <b>DOWNLOAD</b> if you accept them."),
        ],
        "note": ("Wait for the file", "The installer is called <b>dwagent.exe</b>. Let the download finish before opening it."),
        "crop": (865, 96, 1424, 660),
        "marks": [mark(1, (1172, 522, 217, 24), (1139, 534)), mark(2, (1196, 582, 136, 44), (1155, 606))],
        "next": "The file appears in your browser's downloads. Continue to screenshot 03.",
    },
    {
        "id": 3, "slug": "find-downloaded-file", "phase": "DOWNLOAD", "title": "Show the downloaded file",
        "subtitle": "This screenshot uses Chrome. Other browsers may look slightly different.",
        "actions": [
            ("1", "Open Downloads in Chrome", "Click the download arrow near the top-right corner of the browser."),
            ("2", "Click the folder icon", "Beside <b>dwagent.exe</b>, click <b>Show in folder</b>. Move the pointer over the row if the icon is hidden."),
        ],
        "note": ("If the panel is missing", "Press <b>Ctrl + J</b>, find <b>dwagent.exe</b>, then choose <b>Show in folder</b>."),
        "crop": (1790, 28, 2180, 252),
        "marks": [mark(1, (2110, 44, 41, 38), (2082, 60)), mark(2, (2058, 133, 39, 36), (2028, 151))],
        "next": "File Explorer opens with dwagent.exe selected. Continue to screenshot 04.",
    },
    {
        "id": 4, "slug": "open-installer", "phase": "DOWNLOAD", "title": "Open dwagent.exe",
        "subtitle": "You are now in the folder where the installer was saved.",
        "actions": [("1", "Double-click dwagent.exe", "Double-click the file name. This starts the DWAgent installer.")],
        "note": ("If you cannot see .exe", "Windows may show the name as <b>dwagent</b>. Its type is <b>Application</b>. Open the file you just downloaded."),
        "extra": "If you saved to another folder, use that folder instead of Downloads.",
        "crop": (273, 40, 1120, 285),
        "marks": [mark(1, (303, 190, 190, 34), (527, 206))],
        "next": "The DWAgent installer opens. Continue to screenshot 05.",
    },
    {
        "id": 5, "slug": "choose-install", "phase": "INSTALL", "title": "Choose Install",
        "subtitle": "Read the licence, terms and privacy information in the installer.",
        "actions": [
            ("1", "Select Install", "If you agree to the terms and the access explained on page 1, select <b>Install</b>."),
            ("2", "Click Next", "Click <b>Next</b> once to continue."),
        ],
        "note": ("Ongoing support", "Install keeps DWAgent on this computer. Closing the installer later does not remove remote access."),
        "marks": [mark(1, (109, 393, 70, 27), (215, 405)), mark(2, (153, 512, 146, 43), (325, 531))],
        "next": "Windows may ask for permission. If it does, follow screenshot 06.",
    },
    {
        "id": 6, "slug": "allow-windows-permission", "phase": "INSTALL", "title": "Allow the installation",
        "subtitle": "Windows may show this User Account Control prompt.",
        "actions": [
            ("1", "Check the app", "For the installer downloaded from the official site, the prompt shown here is <b>DWAgent installer</b>, by <b>DWSNET s.r.l.</b>"),
            ("2", "Click Yes", "Click <b>Yes</b> to let the installer make changes."),
        ],
        "note": ("Administrator access", "If Windows asks for an administrator's password, ask your administrator for help. If this prompt does not appear, continue."),
        "marks": [mark(1, (20, 133, 286, 101), (340, 164), "check"), mark(2, (22, 334, 208, 41), (125, 302))],
        "next": "Return to the DWAgent installer and check the folder in screenshot 07.",
    },
    {
        "id": 7, "slug": "installation-folder", "phase": "INSTALL", "title": "Keep the default folder",
        "subtitle": "This is where DWAgent will be installed on your computer.",
        "actions": [
            ("1", "Check the Path", r"Leave <b>C:\Program Files\DWAgent</b> as it is unless your administrator tells you otherwise."),
            ("2", "Click Next", "There is no need to type a new folder."),
        ],
        "marks": [mark(1, (317, 147, 407, 37), (280, 166), "check"), mark(2, (153, 512, 146, 43), (325, 531))],
        "next": "The installer asks you to confirm this folder. Continue to screenshot 08.",
    },
    {
        "id": 8, "slug": "confirm-folder", "phase": "INSTALL", "title": "Confirm the installation folder",
        "subtitle": "The folder in this question should match the one on the previous screen.",
        "actions": [
            ("1", "Select Yes", "Choose <b>Yes</b> to confirm the folder."),
            ("2", "Click Next", "The installer starts downloading and installing its files."),
        ],
        "marks": [mark(1, (110, 151, 64, 29), (212, 166)), mark(2, (153, 512, 146, 43), (325, 531))],
        "next": "A progress screen appears. This is expected. Continue to screenshot 09.",
    },
    {
        "id": 9, "slug": "wait-for-installation", "phase": "INSTALL", "title": "Wait while the files install",
        "subtitle": "This is a progress screen. You do not need to click anything here.", "mode": "wait",
        "actions": [("1", "Let the installer continue", "Keep the internet connection on and leave this window open. The file name and percentage can change.")],
        "note": ("Even if it says 100%", "Wait until the next screen opens automatically. The <b>Next</b> button is greyed out on this screen."),
        "extra": "If an error appears or progress does not continue, contact Postiqo Support and send the error message.",
        "marks": [mark(1, (106, 254, 618, 40), (438, 214), "wait")],
        "next": "Wait for the configuration choices shown in screenshot 10.",
    },
    {
        "id": 10, "slug": "create-new-agent", "phase": "CONNECT", "title": "Choose Creating a new agent",
        "subtitle": "This Postiqo setup uses the support account details on the next screen.",
        "actions": [
            ("1", "Select Creating a new agent", "Choose the second option: <b>Creating a new agent</b>."),
            ("2", "Click Next", "You will enter the support details on the next screen."),
        ],
        "note": ("No installation code needed", "Leave <b>Enter the installation code</b> unselected for this setup."),
        "marks": [mark(1, (108, 180, 173, 32), (317, 196)), mark(2, (153, 512, 146, 43), (325, 531))],
        "next": "Enter all three fields shown in screenshot 11.",
    },
    {
        "id": 11, "slug": "enter-support-details", "phase": "CONNECT", "title": "Enter the support details",
        "subtitle": "Use these exact support details. Give the agent your own name and company.",
        "actions": [
            ("1", "User", "<b>support@postiqo.io</b>"),
            ("2", "Installation password", "<b>postiqo</b><br/>All lowercase. The field hides the letters."),
            ("3", "Agent name", "Enter <b>your name - your company</b>.<br/><b>Jane Smith - Acme</b> is an example; replace it with your details."),
            ("4", "Check, then click Next", "Check all three fields before continuing."),
        ],
        "marks": [
            mark(1, (318, 148, 406, 35), (287, 166)),
            mark(2, (318, 184, 406, 35), (287, 201)),
            mark(3, (318, 220, 406, 35), (287, 237)),
            mark(4, (153, 512, 146, 43), (325, 531)),
        ],
        "next": "The agent is created for the support account. Continue to screenshot 12.",
    },
    {
        "id": 12, "slug": "wait-for-agent-creation", "phase": "CONNECT", "title": "Wait while the agent is created",
        "subtitle": "This is another progress screen. No action is needed.", "mode": "wait",
        "actions": [("1", "Wait for this message to change", "<b>Agent creation in progress...</b> means the installer is connecting the computer to the support account.")],
        "note": ("Leave the window open", "Keep the computer connected to the internet. The buttons are greyed out while this is happening."),
        "extra": "If you receive an error, check the three fields from screenshot 11 or contact Postiqo Support.",
        "marks": [mark(1, (104, 252, 203, 33), (341, 269), "wait")],
        "next": "Wait for Installation has been completed, shown in screenshot 13.",
    },
    {
        "id": 13, "slug": "finish-installation", "phase": "CONNECT", "title": "Finish the installation",
        "subtitle": "Only close the installer after it confirms that installation is complete.",
        "actions": [
            ("1", "Check the completion message", "Look for <b>Installation has been completed.</b>"),
            ("2", "Click Close", "Click the <b>Close</b> button at the bottom right."),
        ],
        "note": ("One more check", "Closing this window leaves DWAgent installed. Next, check that the agent is Online."),
        "marks": [mark(1, (105, 252, 221, 33), (359, 269), "check"), mark(2, (627, 512, 147, 43), (599, 531))],
        "next": "Find the DWAgent tray icon using screenshot 14.",
    },
    {
        "id": 14, "slug": "open-agent-monitor", "phase": "CHECK", "title": "Open DWAgent from the taskbar",
        "subtitle": "Look near the clock at the bottom-right of the Windows desktop.",
        "actions": [
            ("1", "Show hidden icons if needed", "Click the small arrow beside the clock if the DWAgent icon is hidden. Skip this if its icon is already visible."),
            ("2", "Click the DWAgent icon", "Look for the gear-shaped icon. Hover over it to see the <b>DWAgent</b> tooltip, then click it."),
        ],
        "note": ("Your taskbar may differ", "The icon can be in a different position. Use its DWAgent tooltip to identify it."),
        "marks": [mark(1, (133, 196, 33, 42), (109, 215)), mark(2, (54, 61, 31, 31), (20, 76))],
        "next": "DWAgent - Monitor opens. Check the status in screenshot 15.",
    },
    {
        "id": 15, "slug": "check-online", "phase": "CHECK", "title": "Check Online and tell Support",
        "subtitle": "You are ready when the correct agent name and Online status are visible.", "mode": "check",
        "actions": [
            ("1", "Check your agent name", "It should show the name you entered. <b>Jane Smith - Acme</b> is the example used in these screenshots."),
            ("2", "Check Online", "Look for <b>Online</b> in the green status area."),
        ],
        "note": ("Tell Postiqo Support", "Send your <b>agent name</b> to <b>support@postiqo.io</b> and say that installation is complete."),
        "extra": "If it says Offline, check the internet connection and contact Support if it stays offline. No activities is normal when nobody is connected.",
        "marks": [mark(1, (138, 59, 143, 27), (106, 72), "check"), mark(2, (168, 92, 72, 27), (271, 105), "check")],
        "next": "Setup is complete. The next page explains how to control or remove access.",
    },
]


def register_fonts():
    fonts = Path(reportlab.__file__).resolve().parent / "fonts"
    pdfmetrics.registerFont(TTFont("Guide", str(fonts / "Vera.ttf")))
    pdfmetrics.registerFont(TTFont("GuideBold", str(fonts / "VeraBd.ttf")))
    pdfmetrics.registerFontFamily("Guide", normal="Guide", bold="GuideBold", italic="Guide", boldItalic="GuideBold")


def paragraph(c, text, x, top, width, size=11.5, leading=16, color=INK, bold=False):
    if "\u2013" in text or "\u2014" in text:
        raise ValueError("Use ASCII hyphens in authored text")
    style = ParagraphStyle("guide", fontName="GuideBold" if bold else "Guide", fontSize=size,
                           leading=leading, textColor=color, spaceAfter=0, allowWidows=0,
                           allowOrphans=0, splitLongWords=False)
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    if top - height < 38:
        raise ValueError(f"Text overflows page: {text[:70]}")
    p.drawOn(c, x, top - height)
    return top - height


def label(c, text, x, y, size=9, color=MUTED, bold=False):
    c.setFillColor(color)
    c.setFont("GuideBold" if bold else "Guide", size)
    c.drawString(x, y, text)


def badge(c, value, x, y, color=ACTION, radius=10):
    c.setFillColor(WHITE)
    c.circle(x, y, radius + 1.4, stroke=0, fill=1)
    c.setFillColor(color)
    c.circle(x, y, radius, stroke=0, fill=1)
    c.setFont("GuideBold", 9 if len(str(value)) < 3 else 7)
    c.setFillColor(WHITE)
    c.drawCentredString(x, y - 3.2, str(value))


def base(c, page, phase):
    c.setFillColor(WHITE)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(BLUE)
    c.rect(0, H - 5, W, 5, stroke=0, fill=1)
    label(c, "postiqo", 40, H - 36, 17, INK, True)
    label(c, "SUPPORT / WINDOWS", 126, H - 33, 8.5, BLUE, True)
    label(c, phase, 738, H - 33, 8.5, MUTED, True)
    c.setStrokeColor(LINE)
    c.setLineWidth(.6)
    c.line(40, 43, W - 40, 43)
    label(c, "support@postiqo.io", 40, 25, 8)
    c.linkURL("mailto:support@postiqo.io", (40, 22, 143, 36), relative=0)
    label(c, "DWService setup for Windows", 361, 25, 8)
    c.setFillColor(MUTED)
    c.setFont("Guide", 8)
    c.drawRightString(W - 40, 25, f"{page:02d} / {PAGE_COUNT:02d}")


def note(c, heading, text, x, top, width, color=BLUE):
    style = ParagraphStyle("note", fontName="Guide", fontSize=10.5, leading=14, textColor=INK)
    p = Paragraph(text, style)
    _, height = p.wrap(width - 24, 500)
    box_height = height + 47
    c.setFillColor(PALE if color == BLUE else colors.HexColor("#FFF6E7"))
    c.roundRect(x, top - box_height, width, box_height, 9, stroke=0, fill=1)
    label(c, heading, x + 12, top - 19, 10, color, True)
    p.drawOn(c, x + 12, top - 32 - height)
    return top - box_height


def screenshot(c, source, frame, crop=None, marks=()):
    """Place an immutable PNG and vector annotations in a PDF viewport."""
    x, y, width, height = frame
    with Image.open(source) as im:
        iw, ih = im.size
    left, top, right, bottom = crop or (0, 0, iw, ih)
    if not (0 <= left < right <= iw and 0 <= top < bottom <= ih):
        raise ValueError(f"Invalid screenshot crop: {source}")
    vw, vh = right - left, bottom - top
    scale = min((width - 40) / vw, (height - 34) / vh)
    dx, dy = x + (width - vw * scale) / 2, y + (height - vh * scale) / 2
    c.setFillColor(colors.HexColor("#F3F6FA"))
    c.setStrokeColor(LINE)
    c.setLineWidth(.8)
    c.roundRect(x, y, width, height, 12, stroke=1, fill=1)
    c.saveState()
    clip = c.beginPath()
    clip.rect(dx, dy, vw * scale, vh * scale)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(ImageReader(str(source)), dx - left * scale,
                dy - (ih - bottom) * scale, width=iw * scale, height=ih * scale, mask="auto")
    c.restoreState()

    def point(px, py):
        return dx + (px - left) * scale, dy + (bottom - py) * scale

    for item in marks:
        px, py, pw, ph = item["box"]
        bx, by = item["badge"]
        if not (left <= px and top <= py and px + pw <= right and py + ph <= bottom):
            raise ValueError(f"Highlight outside viewport: {source}, {item}")
        rx, ry = point(px, py + ph)
        rw, rh = pw * scale, ph * scale
        cx, cy = point(bx, by)
        if not (x + 11 <= cx <= x + width - 11 and y + 11 <= cy <= y + height - 11):
            raise ValueError(f"Badge outside frame: {source}, {item}")
        color = {"action": ACTION, "check": CHECK, "wait": WAIT}[item["kind"]]
        # White under-stroke keeps the border visible over both dark and light UI.
        for stroke_color, line_width in [(WHITE, 4.4), (color, 2.0)]:
            c.setStrokeColor(stroke_color)
            c.setLineWidth(line_width)
            c.roundRect(rx, ry, rw, rh, min(5, rh / 3), stroke=1, fill=0)
        tx, ty = max(rx, min(cx, rx + rw)), max(ry, min(cy, ry + rh))
        c.setStrokeColor(color)
        c.setLineWidth(1.4)
        c.line(cx, cy, tx, ty)
        badge(c, item["label"], cx, cy, color)


def action_list(c, actions, top, mode="action", kinds=None):
    y = top
    for number, heading, body in actions:
        kind = (kinds or {}).get(str(number), mode)
        color = {"action": ACTION, "check": CHECK, "wait": WAIT}[kind]
        badge(c, number, 50, y - 8, color)
        y = paragraph(c, heading, 70, y + 1, 226, 12.3, 16.5, bold=True)
        y = paragraph(c, body, 70, y - 6, 226, 11.2, 15.5)
        y -= 21
    return y


def step_page(c, step, sources):
    sid = step["id"]
    base(c, sid + 1, f"{step['phase']}  /  SCREENSHOT {sid:02d} OF 15")
    c.bookmarkPage(f"screen-{sid:02d}")
    c.addOutlineEntry(f"{sid:02d}. {step['title']}", f"screen-{sid:02d}", 1)
    c.setFillColor(BLUE)
    c.roundRect(40, 535, 58, 51, 12, stroke=0, fill=1)
    c.setFont("GuideBold", 23)
    c.setFillColor(WHITE)
    c.drawCentredString(69, 551, f"{sid:02d}")
    paragraph(c, step["title"], 116, 585, 804, 25.5, 31, bold=True)
    paragraph(c, step["subtitle"], 116, 546, 804, 11.5, 16, color=MUTED)
    y = 491
    if step.get("intro"):
        y = paragraph(c, step["intro"], 40, y, 257, 11.1, 16) - 26
    y = action_list(c, step["actions"], y, step.get("mode", "action"),
                    {m["label"]: m["kind"] for m in step["marks"]})
    if step.get("note"):
        y = note(c, *step["note"], 40, y - 2, 256, WAIT if step.get("mode") == "wait" else BLUE) - 15
    if step.get("extra"):
        y = paragraph(c, step["extra"], 40, y, 256, 10.4, 14.5, color=MUTED)
    if y < 125:
        raise ValueError(f"Step {sid} text touches the next-step strip: y={y}")
    screenshot(c, sources / f"{sid:02d}.png", (326, 130, 594, 385), step.get("crop"), step["marks"])
    label(c, "Numbers match the actions on the left." if step.get("mode") != "wait" else "Highlighted area: progress to watch, not a button to click.", 338, 115, 8.3, MUTED)
    c.setFillColor(PALE)
    c.roundRect(40, 61, 880, 39, 8, stroke=0, fill=1)
    label(c, "NEXT" if sid < 15 else "DONE", 54, 76, 9, BLUE, True)
    paragraph(c, step["next"], 107, 86, 793, 10.5, 14, color=INK)
    c.linkRect("", f"screen-{sid+1:02d}" if sid < 15 else "access-controls", (40, 61, 920, 100), relative=0, thickness=0)
    c.showPage()


def cover(c):
    base(c, 1, "CLIENT INSTALLATION GUIDE")
    c.bookmarkPage("start")
    c.addOutlineEntry("Before you begin", "start", 0)
    paragraph(c, "Set up DWService<br/>on Windows", 40, 562, 600, 37, 45, bold=True)
    paragraph(c, "15 screenshots. One step at a time.", 42, 455, 700, 17, 24, color=BLUE)
    paragraph(c, "Install DWAgent on the computer that needs help, then connect it to Postiqo Support. Follow the screenshot numbers in order.", 42, 416, 810, 13, 19)
    note(c, "Understand the access before you begin", "This installs ongoing remote support access. While DWAgent is enabled and online, Postiqo Support can view and control this computer and access files. With <b>Unattended access = Yes</b>, connections do not need a new approval. Closing the installer or browser does not remove access. Continue only if you are authorised to approve this access and agree to it. Access controls are on page 17.", 40, 353, 880)
    chapters = [("01-04", "Download", "screen-01"), ("05-09", "Install", "screen-05"), ("10-13", "Connect", "screen-10"), ("14-15", "Check Online", "screen-14")]
    for i, (numbers, title, destination) in enumerate(chapters):
        x = 40 + i * 224
        label(c, numbers, x, 212, 11, BLUE, True)
        label(c, title, x, 187, 15, INK, True)
        c.linkRect("", destination, (x, 177, x + 205, 230), relative=0, thickness=0)
    paragraph(c, "Use your own name and company for the agent name. The support account details are shown in screenshot 11 (page 12). Have an internet connection and permission to install software.", 40, 155, 880, 11.3, 16)
    badge(c, "1", 51, 91, ACTION, 9)
    label(c, "Click or type", 67, 88, 9)
    badge(c, "1", 205, 91, CHECK, 9)
    label(c, "Check the highlighted item", 221, 88, 9)
    badge(c, "1", 422, 91, WAIT, 9)
    label(c, "Wait - no click needed", 438, 88, 9)
    label(c, "Official installation help", 750, 88, 8.3, BLUE)
    c.linkURL(INSTALL_URL, (748, 85, 920, 101), relative=0)
    c.showPage()
    c.bookmarkPage("installation")
    c.addOutlineEntry("Installation - screenshots 01-15", "installation", 0)


def access_page(c, sources):
    base(c, PAGE_COUNT, "AFTER SETUP / ACCESS CONTROLS")
    c.bookmarkPage("access-controls")
    c.addOutlineEntry("Access controls", "access-controls", 0)
    paragraph(c, "You control remote support access", 40, 580, 880, 29, 36, bold=True)
    paragraph(c, "Open DWAgent - Monitor using screenshot 14. Choose the option you need below.", 40, 535, 880, 12, 17, color=MUTED)
    actions = [
        ("A", "Pause access", "Click <b>Disable</b>, confirm if asked, and check that access is disabled."),
        ("B", "Remove access", "Click <b>Uninstall</b> and follow the prompts. Ask your administrator for help if needed."),
        ("C", "Require approval", "Under <b>Unattended access</b>, select <b>No</b> to approve incoming connections. Follow any prompt."),
    ]
    y = action_list(c, actions, 486)
    paragraph(c, "These are separate choices. <b>Yes</b> allows connections without a new approval; <b>No</b> requires acceptance. This screenshot shows Yes.", 40, y, 256, 10.4, 14.5, color=MUTED)
    screenshot(c, sources / "15.png", (326, 179, 594, 323), marks=[
        mark("A", (418, 38, 126, 42), (385, 59)),
        mark("B", (418, 122, 126, 42), (385, 144)),
        mark("C", (488, 295, 47, 26), (382, 295)),
    ])
    paragraph(c, "Closing the monitor does not stop access. An internet disconnection interrupts access only temporarily; it can return when the computer reconnects.", 338, 158, 566, 10.5, 14.5, color=MUTED)
    label(c, "Need help? support@postiqo.io", 40, 103, 10.3, BLUE, True)
    sources_links = [("Disable help", DISABLE_URL), ("Uninstall help", REMOVE_URL), ("Unattended access help", ACCESS_URL)]
    x = 40
    for title, url in sources_links:
        label(c, title, x, 67, 8.3, BLUE)
        length = pdfmetrics.stringWidth(title, "Guide", 8.3)
        c.linkURL(url, (x, 64, x + length, 77), relative=0)
        x += length + 24
    c.showPage()


def validate_sources(sources):
    manifest = sources.parent / "sources.json"
    if manifest.exists():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for record in data["screenshots"]:
            path = sources / record["file"]
            if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
                raise ValueError(f"Preserved screenshot changed: {path}")


def build(output, sources):
    validate_sources(sources)
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=(W, H), pageCompression=1, invariant=1)
    c.setTitle("Postiqo - DWService setup for Windows")
    c.setAuthor("Postiqo Support")
    c.setSubject("A Windows installation guide with 15 numbered screenshots and access controls")
    c.setCreator("Postiqo support documentation")
    c.setViewerPreference("DisplayDocTitle", "true")
    cover(c)
    for step in STEPS:
        step_page(c, step, sources)
    access_page(c, sources)
    c.save()
    reader = PdfReader(output)
    assert len(reader.pages) == PAGE_COUNT
    for page, step in zip(reader.pages[1:16], STEPS):
        text = page.extract_text()
        assert step["title"] in text
        assert f"SCREENSHOT {step['id']:02d} OF 15" in text
    assert "You control remote support access" in reader.pages[16].extract_text()
    assert not any(d in "\n".join(p.extract_text() for p in reader.pages) for d in ["\u2013", "\u2014"])
    validate_sources(sources)
    print(f"Created {output}: {len(reader.pages)} pages, {output.stat().st_size:,} bytes")


def export_pngs(pdf, folder, dpi):
    executable = shutil.which("pdftoppm")
    if not executable:
        raise RuntimeError("pdftoppm is required for PNG export")
    folder.mkdir(parents=True, exist_ok=True)
    subprocess.run([executable, "-r", str(dpi), "-png", str(pdf), str(folder / "page")], check=True)
    step_folder = folder / "steps"
    step_folder.mkdir(exist_ok=True)
    for step in STEPS:
        source = folder / f"page-{step['id'] + 1:02d}.png"
        shutil.copyfile(source, step_folder / f"{step['id']:02d}-{step['slug']}.png")
    archive_path = pdf.with_name("dwservice-windows-steps.zip")
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(step_folder.glob("*.png")):
            archive.write(file, file.name)
    print(f"Exported numbered steps: {archive_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "output/pdf/dwservice-windows.pdf")
    parser.add_argument("--sources", type=Path, default=SOURCES)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--dpi", type=int, default=144)
    args = parser.parse_args()
    build(args.output, args.sources)
    if args.render_dir:
        export_pngs(args.output, args.render_dir, args.dpi)
