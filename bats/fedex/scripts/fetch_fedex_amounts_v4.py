"""
[参照用 / REFERENCE COPY — runs on Windows with Edge + Playwright]
元ファイル: PC デスクトップ → fedex/fetch_fedex_amounts_v4.py

V4: Lataa FedEx-laskujen PDF:t kayttaen Gmailin suoraa download-linkkia.
Hakee jokaisen sahkopostin, etsii attachment download -linkin ja lataa sen.
（Gmail から各 FedEx 請求 PDF をダウンロードし、PDF から合計金額を抽出）

出力: fedex_unpaid_amounts.json  ([{ invoice, amount }])

依存: pip install playwright pymupdf ; playwright install
このコンテナ(Linux)では動きません。Windows 上で実行してください。
"""
import asyncio
import re
import os
import json
import glob
import fitz  # PyMuPDF
from playwright.async_api import async_playwright

UNPAID = [
    "517145052", "517145182", "517146202", "517146959", "517147195",
    "517147280", "517147548", "517147868", "517148153", "517148910",
    "517149124", "517149234", "517149559", "517149785", "517150732",
    "517150920", "517151081", "517151333", "517151601", "517151893",
    "517152669", "517152884", "517153079", "517153392", "517153710",
    "517154086", "517154844",
]

EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE_DIR = "C:/Users/Anu/AppData/Local/Microsoft/Edge/User Data"
DOWNLOAD_DIR = "C:/Users/Anu/Downloads/FedEx_temp"


def extract_amount_from_pdf(pdf_path):
    """Lue laskun loppusumma PDF:sta."""
    try:
        doc = fitz.open(pdf_path)
        full_text = ""
        for page in doc:
            full_text += page.get_text()

        patterns = [
            r'Yhteensa\s+EUR\s+([\d\s.,]+)',
            r'Total\s+EUR\s+([\d\s.,]+)',
            r'TOTAL\s+EUR\s+([\d\s.,]+)',
            r'Loppusumma[:\s]*([\d\s.,]+)',
            r'Amount\s+Due[:\s]*EUR?\s*([\d\s.,]+)',
            r'Maksettava[:\s]*([\d\s.,]+)',
            r'Yhteensa\s*([\d][.\d]*[,]\d{2})',
        ]

        for pat in patterns:
            matches = re.findall(pat, full_text, re.IGNORECASE)
            if matches:
                return matches[-1].strip()

        # Fallback: largest EUR amount
        all_amounts = re.findall(r'(\d[\d\s.]*,\d{2})', full_text)
        if all_amounts:
            parsed = []
            for a in all_amounts:
                clean = a.replace(' ', '').replace('.', '').replace(',', '.')
                try:
                    parsed.append((float(clean), a.strip()))
                except Exception:
                    pass
            if parsed:
                parsed.sort(reverse=True)
                return parsed[0][1]

        return None
    except Exception as e:
        return f"VIRHE: {e}"


async def download_invoice(page, invoice_nr):
    """Lataa lasku: avaa sahkoposti -> kayta download-linkkia suoraan."""
    try:
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)

        search_box = page.locator('input[name="q"]')
        await search_box.click(timeout=5000)
        await search_box.fill("")
        await search_box.fill(f"from:nordicinvhelp {invoice_nr}")
        await search_box.press("Enter")
        await page.wait_for_timeout(3000)

        rows = page.locator('[role="main"] tr')
        count = await rows.count()
        if count == 0:
            return "EI LOYDY"

        await rows.first.click()
        await page.wait_for_timeout(3000)

        download_links = page.locator(
            f'a[download*="{invoice_nr}"], a[href*="disp=safe"][href*="{invoice_nr}"]'
        )
        dl_count = await download_links.count()

        if dl_count > 0:
            async with page.expect_download(timeout=15000) as download_info:
                await download_links.first.click()
            download = await download_info.value
            await download.save_as(os.path.join(DOWNLOAD_DIR, f"{invoice_nr}.pdf"))
            return "OK"

        all_dl_links = page.locator('a[href*="disp=safe"]')
        if await all_dl_links.count() > 0:
            async with page.expect_download(timeout=15000) as download_info:
                await all_dl_links.first.click()
            download = await download_info.value
            await download.save_as(os.path.join(DOWNLOAD_DIR, f"{invoice_nr}.pdf"))
            return "OK (method2)"

        dl_btns = page.get_by_text("ダウンロード")
        if await dl_btns.count() > 1:
            async with page.expect_download(timeout=15000) as download_info:
                await dl_btns.last.click()
            download = await download_info.value
            await download.save_as(os.path.join(DOWNLOAD_DIR, f"{invoice_nr}.pdf"))
            return "OK (method3)"

        att_urls = await page.evaluate(
            """() => {
                const links = document.querySelectorAll('a[href*="view=att"]');
                return Array.from(links).map(a => a.href);
            }"""
        )
        if att_urls:
            for url in att_urls:
                async with page.expect_download(timeout=15000) as download_info:
                    await page.goto(url)
                download = await download_info.value
                await download.save_as(os.path.join(DOWNLOAD_DIR, f"{invoice_nr}.pdf"))
                return "OK (method4)"

        return "EI LATAUSLINKKIA"
    except Exception as e:
        return f"VIRHE: {str(e)[:80]}"


async def main():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    existing = set()
    for f in glob.glob(os.path.join(DOWNLOAD_DIR, "517*.pdf")):
        existing.add(os.path.basename(f).replace(".pdf", ""))

    to_download = [inv for inv in UNPAID if inv not in existing]
    print(f"Jo ladattu: {len(existing)}, ladattava: {len(to_download)}")

    if to_download:
        async with async_playwright() as p:
            browser = await p.chromium.launch_persistent_context(
                PROFILE_DIR,
                executable_path=EDGE_PATH,
                headless=False,
                channel="msedge",
                args=["--profile-directory=Default"],
                accept_downloads=True,
            )
            page = browser.pages[0] if browser.pages else await browser.new_page()
            await page.goto("https://mail.google.com/mail/u/0/#inbox")
            await page.wait_for_timeout(5000)

            for i, inv in enumerate(to_download):
                print(f"[{i+1}/{len(to_download)}] {inv}...", end=" ", flush=True)
                print(await download_invoice(page, inv))

            await page.wait_for_timeout(2000)
            await browser.close()

    print("\n" + "=" * 60)
    print("MAKSAMATTOMAT FEDEX-LASKUT:")
    print("=" * 60)

    results = []
    total = 0
    for inv in UNPAID:
        pdf_path = os.path.join(DOWNLOAD_DIR, f"{inv}.pdf")
        if os.path.exists(pdf_path):
            amount_str = extract_amount_from_pdf(pdf_path)
            results.append({"invoice": inv, "amount": amount_str})
            print(f"  {inv}: {amount_str} EUR")
            if amount_str:
                try:
                    total += float(amount_str.replace(' ', '').replace('.', '').replace(',', '.'))
                except Exception:
                    pass
        else:
            results.append({"invoice": inv, "amount": "EI LADATTU"})
            print(f"  {inv}: EI LADATTU")

    print(f"\n YHTEENSA MAKSAMATTA: {total:,.2f} EUR")

    with open("fedex_unpaid_amounts.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("Tulokset: fedex_unpaid_amounts.json")


asyncio.run(main())
