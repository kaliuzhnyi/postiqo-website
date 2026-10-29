# DWService Windows guide

The public PDF always lives at `/support/dwservice-windows.pdf`.
Keep that path unchanged when replacing the document.

The 15 original PNGs supplied on October 29, 2026 are preserved in
`screenshots/`. They are byte-for-byte copies of `1.png` through `15.png`
from the supplied ShareX folder. `sources.json` records their SHA256 hashes.
The supplied ShareX files are never changed by the generator.

`scripts/generate-dwservice-guide.py` embeds these PNGs without changing their
pixels. It uses PDF clipping to focus the first four screenshots and vector
frames and numbered badges to highlight controls. It does not replace UI text,
invent screens or use screenshots from the older guide.

The English guide has 17 pages: an introduction, screenshots 01-15 in process
order, and access controls. The last page reuses screenshot 15 with separate
lettered annotations. Screenshots 09 and 12 explicitly explain waiting.

| Screenshot | Screen | PDF page |
| --- | --- | --- |
| 01 | Official Windows download | 2 |
| 02 | Download notice and Privacy Policy | 3 |
| 03 | Browser downloads and Show in folder | 4 |
| 04 | File Explorer and dwagent.exe | 5 |
| 05 | Install selection | 6 |
| 06 | Windows permission prompt | 7 |
| 07 | Default installation folder | 8 |
| 08 | Folder confirmation | 9 |
| 09 | Download and installation progress | 10 |
| 10 | Creating a new agent | 11 |
| 11 | Support details and agent name | 12 |
| 12 | Agent creation in progress | 13 |
| 13 | Installation completed | 14 |
| 14 | Taskbar and DWAgent icon | 15 |
| 15 | DWAgent Monitor and Online status | 16 |

Generate with Python, ReportLab, Pillow and pypdf:

```sh
python scripts/generate-dwservice-guide.py
```

The default output is `output/pdf/dwservice-windows.pdf`. To also render all
pages and export the 15 annotated instruction pages as ordered PNGs in a ZIP,
install Poppler and use:

```sh
python scripts/generate-dwservice-guide.py --render-dir tmp/pdfs/dwservice --dpi 144
```

The ZIP is `output/pdf/dwservice-windows-steps.zip`. Its filenames start with
`01-` through `15-` so they sort in installation order. The generator checks the
preserved PNG hashes, page count, screenshot order, annotation bounds and text
overflow. Visually inspect every rendered page before copying the approved PDF
to `support/dwservice-windows.pdf`. Keep the documentation page's page count and
access-control page link in sync. Source PNGs, scripts and this README are not
included in the public site's build allowlist.

Installation details and access controls were checked against the supplied
screenshots and the following official documentation on October 29, 2026:

- [Windows installation with credentials](https://docs.dwservice.net/docs/site/agent-installation-step-by-step/windows/windows-install-the-agent-with-credentials/)
- [Unattended access](https://docs.dwservice.net/docs/site/basic-definitions/unattended-access/)
- [Temporarily disable the agent](https://docs.dwservice.net/docs/site/dwservice-installation/how-to-temporarily-disable-the-agent/)
- [Remove the agent](https://docs.dwservice.net/docs/site/dwservice-installation/how-to-remove-the-agent/)

The installation password is retained from the previously approved public
Postiqo guide. The masked field in screenshot 11 remains unchanged.
