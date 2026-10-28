# Esai AV portfolio and media kit

Portal path: https://esai.3dvr.tech/
Kit: https://esai.3dvr.tech/kit/

Content supplied by Thomas: Esai Gamboa works in AV and has worked with Encore and SD Showdown. Uploaded source: Esai_Gamboa_AV_Resume.pdf, supplied by Thomas in this task. Direct email/phone, San Diego County location, A2/audio/video/lighting support, technical familiarity, bilingual ability, and IATSE Local 122 stagehand/crew experience come from that resume. Thomas explicitly approved including IATSE after reviewing the resume. Dates remain unspecified because the source marks them to confirm. No endorsements or rates are asserted. No Facebook identity was confidently verified. Portrait source: https://www.3dvr.tech/media/Esai_Gamboa.jpg (existing public 3DVR team profile).

Booking uses Esai’s direct professional email and phone from his supplied resume. No messages are sent by this page.

The QR encodes the permanent portal path, not an unconfigured subdomain. The page can later redirect from esai.3dvr.tech without reprinting the QR. Social share buttons open the platform composer; they do not post automatically.

Print PDF: two pages, 3.75 x 2.25 inches, including 0.125-inch bleed; trim to 3.5 x 2 inches. Each side is 1125 x 675 pixels at 300 DPI. The back uses Esai’s direct professional email and phone. Confirm copy, contact route, and printer duplex orientation with Esai before ordering.

Rebuild: python3 esai/source/generate-kit.py (Pillow and reportlab, plus system DejaVu fonts). QR PNG/SVG retain a four-module white quiet zone. Square: 1080x1080; story: 1080x1920; landscape/open-graph: 1200x630. Captions are downloadable.

Validation: all local page/asset links checked; social graphics and both rendered PDF pages visually inspected. No billing, identity, runtime, DNS, or routing behavior changed.

Primary address: https://esai.3dvr.tech/
Mirror: https://portal.3dvr.tech/esai/
Both use the same immutable OVH release under /opt/3dvr-portal-production/current/esai.
Caddy site configuration: ops/caddy/esai.Caddyfile; install as an additional block in /etc/caddy/Caddyfile.
DNS: esai A record targets the OVH portal host. Caddy manages HTTPS for this hostname.
Regenerate artwork with python3 esai/source/generate-kit.py after URL changes; update cache keys in HTML.
Résumé has prominent view/download actions on the portfolio and kit; self-host serves PDFs as application/pdf.
